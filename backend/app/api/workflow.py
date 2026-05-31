"""Workflow 编排 API 路由"""
import json
import asyncio
import uuid
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.schemas.workflow import (
    WorkflowTemplate,
    WorkflowTemplateListItem,
    WorkflowTemplateListResponse,
    WorkflowExecution,
    WorkflowExecutionListItem,
    WorkflowExecutionListResponse,
    CreateTemplateRequest,
    UpdateTemplateRequest,
    ExecuteRequest,
    ExecuteResponse,
    ExecutionStatus,
    StepStatus,
)
from app.services.workflow_store import WorkflowStore
from app.services.workflow_engine import WorkflowEngine, engine as default_engine

router = APIRouter()

# 初始化存储并加载预置模板
store = WorkflowStore()
store.ensure_presets()

# 将 store 注入引擎以启用持久化
default_engine.store = store


# ==================== 辅助函数 ====================

def _validate_dependencies(steps):
    """校验所有 depends_on 引用存在的步骤 ID，且不形成循环依赖"""
    step_ids = {s.id for s in steps}

    # 检查引用存在
    for s in steps:
        for dep in s.depends_on:
            if dep not in step_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"步骤 '{s.id}' 依赖的 '{dep}' 不在步骤列表中",
                )

    # 检查循环依赖（DFS 染色法）
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {s.id: WHITE for s in steps}
    adj = {s.id: s.depends_on for s in steps}

    def _dfs(node):
        color[node] = GRAY
        for neighbor in adj.get(node, []):
            if color[neighbor] == GRAY:
                raise HTTPException(
                    status_code=400,
                    detail=f"检测到循环依赖: {node} → {neighbor}",
                )
            if color[neighbor] == WHITE:
                _dfs(neighbor)
        color[node] = BLACK

    for sid in step_ids:
        if color[sid] == WHITE:
            _dfs(sid)


# ==================== 模板管理 ====================

@router.post("/workflow/templates", response_model=WorkflowTemplate)
async def create_template(request: CreateTemplateRequest):
    """创建 Workflow 模板"""
    if store.template_exists(request.id):
        raise HTTPException(status_code=409, detail=f"模板 '{request.id}' 已存在")

    # 校验 output_step 存在于 steps 中
    step_ids = {s.id for s in request.steps}
    if request.output_step not in step_ids:
        raise HTTPException(
            status_code=400,
            detail=f"output_step '{request.output_step}' 不在步骤列表中: {step_ids}",
        )

    # 校验 depends_on 引用的步骤都存在，且无循环依赖
    _validate_dependencies(request.steps)

    template = WorkflowTemplate(
        id=request.id,
        name=request.name,
        description=request.description,
        steps=request.steps,
        output_step=request.output_step,
    )
    return store.save_template(template)


@router.get("/workflow/templates", response_model=WorkflowTemplateListResponse)
async def list_templates():
    """列出所有模板（不含完整步骤定义）"""
    templates = store.list_templates()
    items = [
        WorkflowTemplateListItem(
            id=t.id,
            name=t.name,
            description=t.description,
            step_count=len(t.steps),
            output_step=t.output_step,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in templates
    ]
    return WorkflowTemplateListResponse(templates=items)


@router.get("/workflow/templates/{template_id}", response_model=WorkflowTemplate)
async def get_template(template_id: str):
    """获取模板详情（含完整步骤定义）"""
    template = store.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板 '{template_id}' 不存在")
    return template


@router.put("/workflow/templates/{template_id}", response_model=WorkflowTemplate)
async def update_template(template_id: str, request: UpdateTemplateRequest):
    """更新模板"""
    template = store.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板 '{template_id}' 不存在")

    if request.name is not None:
        template.name = request.name
    if request.description is not None:
        template.description = request.description
    if request.steps is not None:
        template.steps = request.steps
        _validate_dependencies(request.steps)
    if request.output_step is not None:
        step_ids = {s.id for s in template.steps}
        if request.output_step not in step_ids:
            raise HTTPException(
                status_code=400,
                detail=f"output_step '{request.output_step}' 不在步骤列表中: {step_ids}",
            )
        template.output_step = request.output_step

    return store.save_template(template)


@router.delete("/workflow/templates/{template_id}")
async def delete_template(template_id: str):
    """删除模板"""
    if not store.delete_template(template_id):
        raise HTTPException(status_code=404, detail=f"模板 '{template_id}' 不存在")
    return {"success": True, "template_id": template_id, "message": "模板已删除"}


# ==================== 执行 Workflow ====================

@router.post("/workflow/execute", response_model=ExecuteResponse)
async def execute_workflow(request: ExecuteRequest):
    """异步执行 Workflow（立即返回执行 ID，后端执行）"""
    template = store.get_template(request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板 '{request.template_id}' 不存在")

    execution_id = str(uuid.uuid4())

    engine = default_engine

    # 启动后台任务，不等待完成
    asyncio.create_task(engine.execute(template, request.input, execution_id=execution_id))

    return ExecuteResponse(
        execution_id=execution_id,
        status=ExecutionStatus.PENDING,
        message="Workflow 已提交后台执行，可通过 /workflow/executions/{id} 查询进度",
    )


@router.post("/workflow/execute-sync", response_model=WorkflowExecution)
async def execute_workflow_sync(request: ExecuteRequest):
    """同步执行 Workflow（等待完成后返回完整结果）"""
    template = store.get_template(request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板 '{request.template_id}' 不存在")

    execution = await default_engine.execute(template, request.input)
    return execution


# ==================== 执行历史 ====================

@router.get("/workflow/executions", response_model=WorkflowExecutionListResponse)
async def list_executions(limit: int = 50):
    """列出执行历史（最近 50 条）"""
    executions = store.list_executions(limit=limit)
    items = [
        WorkflowExecutionListItem(
            id=e.id,
            template_id=e.template_id,
            template_name=e.template_name,
            status=e.status,
            step_count=len(e.step_results),
            completed_steps=sum(
                1 for sr in e.step_results.values()
                if sr.status in (StepStatus.SUCCESS, StepStatus.FAILED, StepStatus.SKIPPED)
            ),
            created_at=e.created_at,
            finished_at=e.finished_at,
        )
        for e in executions
    ]
    return WorkflowExecutionListResponse(executions=items)


@router.get("/workflow/executions/{execution_id}", response_model=WorkflowExecution)
async def get_execution(execution_id: str):
    """查看执行详情（含每步状态、输入输出）"""
    execution = store.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail=f"执行记录 '{execution_id}' 不存在")
    return execution


# ==================== SSE 实时进度 ====================

@router.get("/workflow/executions/{execution_id}/stream")
async def stream_execution(execution_id: str):
    """通过 SSE 实时推送执行进度"""

    async def event_generator():
        engine = default_engine
        queue = engine.get_event_queue(execution_id)

        if queue is None:
            # 执行可能已完成，尝试从存储中直接返回
            exec_record = store.get_execution(execution_id)
            if exec_record:
                yield {
                    "event": "complete",
                    "data": json.dumps(exec_record.model_dump(), ensure_ascii=False),
                }
                return
            else:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": f"执行 '{execution_id}' 不存在"}),
                }
                return

        try:
            while True:
                try:
                    # 最多等 30 秒，超时就发一个 heartbeat
                    event_data = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield {"event": "heartbeat", "data": "{}"}
                    continue

                if event_data is None:
                    # 执行完成信号
                    yield {"event": "complete", "data": "{}"}
                    break

                yield {
                    "event": "update",
                    "data": json.dumps(event_data, ensure_ascii=False),
                }
        except asyncio.CancelledError:
            pass

    return EventSourceResponse(event_generator())


# ==================== 预置模板初始化 ====================

@router.post("/workflow/templates/presets/reset")
async def reset_presets():
    """重置预置模板（删除并重新创建）"""
    presets = ["incident_diagnosis", "batch_log_analysis", "rag_enhanced_qa"]
    for pid in presets:
        store.delete_template(pid)
    store.ensure_presets()
    return {"success": True, "message": f"已重置 {len(presets)} 个预置模板"}
