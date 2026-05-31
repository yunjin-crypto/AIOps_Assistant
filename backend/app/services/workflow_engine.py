"""Workflow DAG 执行引擎

核心流程:
1. 解析模板 → 构建 DAG（邻接表）
2. 拓扑排序 → 确定执行层级（同层可并行）
3. 按层执行 → asyncio.gather 并行
4. 变量解析 → 运行时替换 $input.xxx / $step_id.output.xxx
5. 结果汇总 → 返回输出步骤的结果
"""
import asyncio
import json
import re
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional, Set
from collections import deque

from app.schemas.workflow import (
    WorkflowTemplate,
    WorkflowExecution,
    StepDef,
    StepResult,
    StepType,
    StepStatus,
    ExecutionStatus,
)
from app.services.llm_service import chat_service, log_service, agent_service
from app.services.rag_service import rag_service


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


# ==================== 变量解析器 ====================

_VAR_PATTERN = re.compile(r"\$([a-zA-Z_]\w*)\.([a-zA-Z_\[\]0-9.]+)")
# 匹配: $input.logs, $analyze_logs.output.type, $step_id.output.排查步骤[0]
# 不匹配: $$escaped, text without $

_MAX_RESOLVE_DEPTH = 5  # 防止循环引用


def resolve_value(value: Any, context: Dict[str, Any], depth: int = 0) -> Any:
    """
    递归解析值中的变量引用。
    - $input.xxx  → context["input"][xxx]
    - $step_id.output.xxx  → context[step_id]["output"][xxx]
    - 字面量直接返回
    """
    if depth > _MAX_RESOLVE_DEPTH:
        return value

    if isinstance(value, str):
        # 整字符串就是一个变量引用: "$input.logs"
        m = _VAR_PATTERN.fullmatch(value.strip())
        if m:
            resolved = _lookup(m.group(1), m.group(2), context)
            return resolve_value(resolved, context, depth + 1)

        # 字符串中包含变量: "错误信息: $input.error"
        def _replace(match):
            result = _lookup(match.group(1), match.group(2), context)
            if isinstance(result, (dict, list)):
                return json.dumps(result, ensure_ascii=False, indent=2)
            return str(result)

        return _VAR_PATTERN.sub(_replace, value)

    elif isinstance(value, dict):
        return {k: resolve_value(v, context, depth) for k, v in value.items()}

    elif isinstance(value, list):
        return [resolve_value(item, context, depth) for item in value]

    else:
        return value


def _lookup(source: str, path: str, context: Dict[str, Any]) -> Any:
    """
    从 context 中按 source.path 查找值。
    source = "input" | step_id
    path  = "logs" | "output.severity" | "output.排查步骤[0]"
    """
    if source not in context:
        raise KeyError(f"变量源 '{source}' 不存在，可用: {list(context.keys())}")

    root = context[source]
    parts = path.split(".")

    current = root
    for part in parts:
        # 处理数组索引: field[0] 或 field[1]
        match = re.match(r"^(\w+)\[(\d+)\]$", part)
        if match:
            key, idx = match.group(1), int(match.group(2))
            if isinstance(current, dict):
                current = current.get(key)
            if isinstance(current, list) and idx < len(current):
                current = current[idx]
            elif isinstance(current, list):
                raise IndexError(f"索引 {idx} 超出范围 (长度 {len(current)}): {path}")
            else:
                raise KeyError(f"无法对非列表类型使用索引: {path}")
        else:
            if isinstance(current, dict):
                if part not in current:
                    raise KeyError(f"字段 '{part}' 不在 {list(current.keys())} 中")
                current = current[part]
            else:
                raise KeyError(f"无法从 {type(current).__name__} 读取字段 '{part}': {path}")

    return current


# ==================== DAG 构建 & 拓扑排序 ====================

def _build_execution_levels(steps: List[StepDef]) -> List[List[StepDef]]:
    """
    Kahn 算法拓扑排序，返回执行层级列表。
    每层内的步骤不互相依赖，可以并行执行。

    例如 steps: A(deps=[]), B(deps=[A]), C(deps=[A]), D(deps=[B,C])
    返回: [[A], [B, C], [D]]
    """
    step_map = {s.id: s for s in steps}

    # 计算入度（依赖数）
    in_degree: Dict[str, int] = {s.id: len(s.depends_on) for s in steps}
    # 构建后继列表（谁依赖我）
    successors: Dict[str, List[str]] = {s.id: [] for s in steps}
    for s in steps:
        for dep in s.depends_on:
            if dep in successors:
                successors[dep].append(s.id)

    # Kahn 算法
    queue: deque = deque([s.id for s in steps if in_degree[s.id] == 0])
    levels: List[List[StepDef]] = []
    completed: Set[str] = set()

    while queue:
        level_ids = list(queue)
        queue.clear()
        level_steps = [step_map[sid] for sid in level_ids]
        levels.append(level_steps)
        completed.update(level_ids)

        for sid in level_ids:
            for successor in successors.get(sid, []):
                in_degree[successor] -= 1
                if in_degree[successor] == 0:
                    queue.append(successor)

    # 检测循环依赖
    if len(completed) != len(steps):
        uncompleted = [s.id for s in steps if s.id not in completed]
        raise ValueError(
            f"检测到循环依赖，以下步骤无法执行: {uncompleted}。"
            f"请检查 depends_on 配置。"
        )

    return levels


# ==================== 步骤执行路由 ====================

async def _run_step(step: StepDef, resolved_input: Dict[str, Any]) -> Any:
    """
    根据步骤类型路由到对应的服务。
    返回步骤的输出（可以是字符串、dict 等）。
    """
    step_type = step.type
    config = step.config or {}

    if step_type == StepType.CHAT:
        message = resolved_input.get("message", "")
        messages = resolved_input.get("messages", None)
        return await chat_service.generate(
            user_content=message,
            messages=messages,
        )

    elif step_type == StepType.LOG_ANALYSIS:
        log_text = resolved_input.get("log_text", "")
        result = await log_service.generate(user_content=log_text)
        # 尝试解析为 JSON 结构，以便下游步骤引用具体字段
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result

    elif step_type == StepType.AGENT_DIAGNOSIS:
        content = resolved_input.get("content", "")
        log_analysis = resolved_input.get("log_analysis", None)
        return await agent_service.generate(
            user_content=content,
            log_analysis=log_analysis,
        )

    elif step_type == StepType.RAG_QUERY:
        question = resolved_input.get("question", "")
        mode = resolved_input.get("mode", "chat")
        top_k = resolved_input.get("top_k", config.get("top_k", 5))
        log_analysis = resolved_input.get("log_analysis", None)
        messages = resolved_input.get("messages", None)
        result = await rag_service.query(
            question=question,
            mode=mode,
            top_k=top_k,
            log_analysis=log_analysis,
            messages=messages,
        )
        # 返回 answer 字符串，方便下游引用
        return result.get("answer", str(result))

    else:
        raise ValueError(f"不支持的步骤类型: {step_type}")


# ==================== 执行引擎核心 ====================

class WorkflowEngine:
    """DAG Workflow 执行引擎"""

    def __init__(self, store=None):
        self.store = store  # WorkflowStore 实例，用于持久化
        self._running: Dict[str, WorkflowExecution] = {}
        self._events: Dict[str, asyncio.Queue] = {}  # execution_id → 事件队列（用于 SSE）

    def get_event_queue(self, execution_id: str) -> Optional[asyncio.Queue]:
        return self._events.get(execution_id)

    async def execute(
        self,
        template: WorkflowTemplate,
        trigger_input: Dict[str, Any],
        execution_id: Optional[str] = None,
    ) -> WorkflowExecution:
        """
        执行一个 Workflow 模板。

        参数:
            template: Workflow 模板
            trigger_input: 触发时传入的原始输入
            execution_id: 执行 ID（不传则自动生成 UUID）

        返回:
            WorkflowExecution: 完整的执行记录
        """
        execution_id = execution_id or str(uuid.uuid4())
        now = _now_iso()

        # 初始化执行记录
        execution = WorkflowExecution(
            id=execution_id,
            template_id=template.id,
            template_name=template.name,
            status=ExecutionStatus.PENDING,
            trigger_input=trigger_input,
            step_results={},
            created_at=now,
        )

        # 初始化所有步骤为 PENDING
        for step in template.steps:
            execution.step_results[step.id] = StepResult(
                step_id=step.id,
                step_type=step.type,
                status=StepStatus.PENDING,
            )

        # 创建事件队列（用于 SSE）
        event_queue: asyncio.Queue = asyncio.Queue()
        self._events[execution_id] = event_queue

        try:
            await self._persist(execution)
            await self._emit(event_queue, execution)

            # 1. 构建执行层级
            execution.status = ExecutionStatus.RUNNING
            execution.started_at = _now_iso()
            await self._persist(execution)
            await self._emit(event_queue, execution)

            levels = _build_execution_levels(template.steps)

            # 2. 全局上下文：{input: trigger_input, step_id: {output: ...}, ...}
            context: Dict[str, Any] = {"input": trigger_input}

            # 3. 按层执行
            for level_idx, level in enumerate(levels):
                # 检查每个步骤是否可执行（上游是否有失败）
                tasks = []
                for step in level:
                    failed_deps = [
                        dep for dep in step.depends_on
                        if execution.step_results[dep].status == StepStatus.FAILED
                    ]
                    if failed_deps:
                        # 上游失败，跳过此步骤
                        sr = execution.step_results[step.id]
                        sr.status = StepStatus.SKIPPED
                        sr.error = f"上游步骤失败: {failed_deps}"
                        sr.finished_at = _now_iso()
                        await self._persist(execution)
                        await self._emit(event_queue, execution)
                    else:
                        tasks.append(step)

                if not tasks:
                    continue

                # 并行执行同层步骤
                coros = [self._execute_step(step, context, execution, event_queue) for step in tasks]
                results = await asyncio.gather(*coros, return_exceptions=True)

                # 收集结果到上下文
                for step, result in zip(tasks, results):
                    sr = execution.step_results[step.id]
                    if isinstance(result, Exception):
                        sr.status = StepStatus.FAILED
                        sr.error = str(result)
                        sr.finished_at = _now_iso()
                    else:
                        sr.status = StepStatus.SUCCESS
                        sr.output = result
                        sr.finished_at = _now_iso()
                        context[step.id] = {"output": result}

                    await self._persist(execution)
                    await self._emit(event_queue, execution)

            # 4. 检查是否有步骤失败，决定整体状态
            any_failed = any(
                sr.status == StepStatus.FAILED
                for sr in execution.step_results.values()
            )
            if any_failed:
                execution.status = ExecutionStatus.FAILED
                failed_ids = [
                    sid for sid, sr in execution.step_results.items()
                    if sr.status == StepStatus.FAILED
                ]
                execution.error = f"步骤执行失败: {failed_ids}"
            else:
                execution.status = ExecutionStatus.SUCCESS
                # 提取最终输出
                if template.output_step in context:
                    execution.final_output = context[template.output_step].get("output")
                elif template.output_step in execution.step_results:
                    execution.final_output = execution.step_results[template.output_step].output

        except Exception as e:
            execution.status = ExecutionStatus.FAILED
            execution.error = str(e)

        finally:
            execution.finished_at = _now_iso()
            await self._persist(execution)
            await self._emit(event_queue, execution)
            # 发送完成信号
            await event_queue.put(None)
            # 延迟清理事件队列（给 SSE 客户端时间读取）
            self._events.pop(execution_id, None)

        return execution

    async def _execute_step(
        self,
        step: StepDef,
        context: Dict[str, Any],
        execution: WorkflowExecution,
        event_queue: asyncio.Queue,
    ) -> Any:
        """执行单个步骤: 解析输入 → 调用服务 → 返回输出"""
        sr = execution.step_results[step.id]
        sr.status = StepStatus.RUNNING
        sr.started_at = _now_iso()

        try:
            # 解析变量引用
            resolved_input = resolve_value(step.input_mapping, context)
            sr.input = resolved_input
        except (KeyError, IndexError) as e:
            sr.status = StepStatus.FAILED
            sr.error = f"变量解析失败: {e}"
            sr.finished_at = _now_iso()
            raise

        await self._persist(execution)
        await self._emit(event_queue, execution)

        # 调用实际服务
        return await _run_step(step, resolved_input)

    async def _persist(self, execution: WorkflowExecution):
        if self.store:
            self.store.save_execution(execution)

    async def _emit(self, queue: asyncio.Queue, execution: WorkflowExecution):
        """向 SSE 队列发送事件"""
        event_data = execution.model_dump()
        # 序列化 step_results 的 key
        event_data["step_results"] = {
            k: v.model_dump() if hasattr(v, "model_dump") else v
            for k, v in execution.step_results.items()
        }
        await queue.put(event_data)


# 全局单例
engine = WorkflowEngine()
