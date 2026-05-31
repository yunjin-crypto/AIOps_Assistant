"""Workflow 存储层 —— 模板与执行记录的 JSON 文件持久化"""
import json
import os
import threading
from datetime import datetime
from typing import List, Optional, Dict

from app.schemas.workflow import (
    WorkflowTemplate,
    WorkflowExecution,
    StepDef,
    StepResult,
    ExecutionStatus,
)

# 数据目录
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "workflows")
DATA_DIR = os.path.abspath(DATA_DIR)
TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")
EXECUTIONS_DIR = os.path.join(DATA_DIR, "executions")

_write_lock = threading.Lock()


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


class WorkflowStore:
    """基于 JSON 文件的 Workflow 模板与执行记录存储"""

    def __init__(self):
        _ensure_dir(TEMPLATES_DIR)
        _ensure_dir(EXECUTIONS_DIR)

    # ========== 模板 CRUD ==========

    def save_template(self, template: WorkflowTemplate) -> WorkflowTemplate:
        now = _now_iso()
        template.created_at = template.created_at or now
        template.updated_at = now
        file_path = os.path.join(TEMPLATES_DIR, f"{template.id}.json")
        with _write_lock:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(template.model_dump(), f, ensure_ascii=False, indent=2)
        return template

    def get_template(self, template_id: str) -> Optional[WorkflowTemplate]:
        file_path = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
        if not os.path.exists(file_path):
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return WorkflowTemplate(**data)

    def list_templates(self) -> List[WorkflowTemplate]:
        templates = []
        if not os.path.exists(TEMPLATES_DIR):
            return templates
        for filename in sorted(os.listdir(TEMPLATES_DIR)):
            if filename.endswith(".json"):
                file_path = os.path.join(TEMPLATES_DIR, filename)
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                templates.append(WorkflowTemplate(**data))
        return templates

    def delete_template(self, template_id: str) -> bool:
        file_path = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
        if not os.path.exists(file_path):
            return False
        with _write_lock:
            os.remove(file_path)
        return True

    def template_exists(self, template_id: str) -> bool:
        return os.path.exists(os.path.join(TEMPLATES_DIR, f"{template_id}.json"))

    # ========== 执行记录 ==========

    def save_execution(self, execution: WorkflowExecution) -> WorkflowExecution:
        file_path = os.path.join(EXECUTIONS_DIR, f"{execution.id}.json")
        with _write_lock:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(execution.model_dump(), f, ensure_ascii=False, indent=2)
        return execution

    def get_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        file_path = os.path.join(EXECUTIONS_DIR, f"{execution_id}.json")
        if not os.path.exists(file_path):
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return WorkflowExecution(**data)

    def list_executions(self, limit: int = 50) -> List[WorkflowExecution]:
        executions = []
        if not os.path.exists(EXECUTIONS_DIR):
            return executions
        files = sorted(
            [f for f in os.listdir(EXECUTIONS_DIR) if f.endswith(".json")],
            reverse=True,  # 最新的在前
        )
        for filename in files[:limit]:
            file_path = os.path.join(EXECUTIONS_DIR, filename)
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            executions.append(WorkflowExecution(**data))
        return executions

    # ========== 预置模板 ==========

    def ensure_presets(self):
        """首次启动时自动创建预置模板（如果不存在）"""
        presets = _get_preset_templates()
        for t in presets:
            if not self.template_exists(t.id):
                self.save_template(t)


# ==================== 预置模板定义 ====================

def _get_preset_templates() -> List[WorkflowTemplate]:
    return [
        # --- 模板 1: 故障诊断流程 ---
        WorkflowTemplate(
            id="incident_diagnosis",
            name="故障诊断流程",
            description="日志分析 → Agent 诊断 → RAG 知识库检索 → 综合报告。适用于收到异常日志后的一站式诊断。",
            steps=[
                StepDef(
                    id="analyze_logs",
                    type="log_analysis",
                    input_mapping={"log_text": "$input.logs"},
                    depends_on=[],
                    config={},
                ),
                StepDef(
                    id="diagnose",
                    type="agent_diagnosis",
                    input_mapping={
                        "content": "$input.error_description",
                        "log_analysis": "$analyze_logs.output",
                    },
                    depends_on=["analyze_logs"],
                    config={},
                ),
                StepDef(
                    id="search_knowledge",
                    type="rag_query",
                    input_mapping={
                        "question": "$diagnose.output",
                        "top_k": 5,
                    },
                    depends_on=["diagnose"],
                    config={"top_k": 5},
                ),
                StepDef(
                    id="generate_report",
                    type="chat",
                    input_mapping={
                        "message": "请根据以下信息生成一份运维故障报告：\n\n【原始异常】\n$input.error_description\n\n【日志分析】\n$analyze_logs.output\n\n【故障诊断】\n$diagnose.output\n\n【知识库参考】\n$search_knowledge.output\n\n请包含：故障概述、根因分析、影响范围、排查过程、解决方案、预防措施。",
                    },
                    depends_on=["search_knowledge"],
                    config={"temperature": 0.3},
                ),
            ],
            output_step="generate_report",
        ),
        # --- 模板 2: 批量日志分析 ---
        WorkflowTemplate(
            id="batch_log_analysis",
            name="批量日志分析",
            description="并行分析多份日志，最后汇总生成综合报告。日志以列表形式传入。",
            steps=[
                StepDef(
                    id="analyze_all",
                    type="log_analysis",
                    input_mapping={
                        "log_text": "$input.logs",
                    },
                    depends_on=[],
                    config={},
                ),
                StepDef(
                    id="summarize",
                    type="chat",
                    input_mapping={
                        "message": "请对以下多份日志分析结果进行汇总，生成综合报告：\n\n$analyze_all.output\n\n请汇总：共性问题、优先级排序、建议处理顺序。",
                    },
                    depends_on=["analyze_all"],
                    config={"temperature": 0.3},
                ),
            ],
            output_step="summarize",
        ),
        # --- 模板 3: 知识增强问答 ---
        WorkflowTemplate(
            id="rag_enhanced_qa",
            name="知识增强问答",
            description="先检索知识库，再用检索结果增强回答。适用于需要参考运维文档的问题。",
            steps=[
                StepDef(
                    id="retrieve",
                    type="rag_query",
                    input_mapping={
                        "question": "$input.question",
                        "top_k": 5,
                    },
                    depends_on=[],
                    config={"top_k": 5},
                ),
                StepDef(
                    id="answer",
                    type="chat",
                    input_mapping={
                        "message": "【用户问题】\n$input.question\n\n【知识库检索结果】\n$retrieve.output\n\n请综合知识库内容和你的专业知识回答用户问题。",
                    },
                    depends_on=["retrieve"],
                    config={},
                ),
            ],
            output_step="answer",
        ),
    ]
