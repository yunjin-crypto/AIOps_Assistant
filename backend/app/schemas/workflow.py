"""Workflow 编排模块数据模型"""
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field


# ==================== Step 定义 ====================

class StepType(str, Enum):
    """步骤类型 —— 映射到现有服务"""
    CHAT = "chat"
    LOG_ANALYSIS = "log_analysis"
    AGENT_DIAGNOSIS = "agent_diagnosis"
    RAG_QUERY = "rag_query"


class StepDef(BaseModel):
    """单个步骤定义"""
    id: str = Field(..., description="步骤唯一标识，如 'analyze_logs'")
    type: StepType = Field(..., description="步骤类型")
    input_mapping: Dict[str, Any] = Field(
        default_factory=dict,
        description="输入映射，值可使用 $input.field 或 $step_id.output.field 变量引用"
    )
    depends_on: List[str] = Field(
        default_factory=list,
        description="依赖的步骤 ID 列表，决定执行顺序"
    )
    config: Dict[str, Any] = Field(
        default_factory=dict,
        description="步骤专属配置 (model, temperature, top_k 等)"
    )


# ==================== Workflow 模板 ====================

class WorkflowTemplate(BaseModel):
    """可复用的 Workflow 模板"""
    id: str = Field(..., description="模板唯一标识，如 'incident_diagnosis_v1'")
    name: str = Field(..., description="模板名称")
    description: str = Field(default="", description="模板描述")
    steps: List[StepDef] = Field(..., description="步骤列表，定义 DAG 结构")
    output_step: str = Field(..., description="最终输出取哪个步骤的结果")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkflowTemplateListItem(BaseModel):
    """模板列表项（不含完整步骤定义，减少传输量）"""
    id: str
    name: str
    description: str
    step_count: int
    output_step: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkflowTemplateListResponse(BaseModel):
    templates: List[WorkflowTemplateListItem]


# ==================== 执行相关 ====================

class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"  # 上游步骤失败导致跳过


class StepResult(BaseModel):
    """单个步骤的执行结果"""
    step_id: str
    step_type: StepType
    status: StepStatus
    input: Optional[Dict[str, Any]] = None   # 变量解析后的实际输入
    output: Optional[Any] = None              # 步骤输出
    error: Optional[str] = None               # 失败时的错误信息
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class WorkflowExecution(BaseModel):
    """一次 Workflow 执行的完整记录"""
    id: str = Field(..., description="执行 ID (UUID)")
    template_id: str
    template_name: str = ""
    status: ExecutionStatus
    trigger_input: Dict[str, Any] = Field(default_factory=dict)
    step_results: Dict[str, StepResult] = Field(default_factory=dict)
    final_output: Optional[Any] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class WorkflowExecutionListItem(BaseModel):
    """执行列表项"""
    id: str
    template_id: str
    template_name: str
    status: ExecutionStatus
    step_count: int
    completed_steps: int
    created_at: Optional[str] = None
    finished_at: Optional[str] = None


class WorkflowExecutionListResponse(BaseModel):
    executions: List[WorkflowExecutionListItem]


# ==================== 请求 / 响应 ====================

class CreateTemplateRequest(BaseModel):
    """创建模板请求"""
    id: str
    name: str
    description: str = ""
    steps: List[StepDef]
    output_step: str


class UpdateTemplateRequest(BaseModel):
    """更新模板请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[StepDef]] = None
    output_step: Optional[str] = None


class ExecuteRequest(BaseModel):
    """执行 Workflow 请求"""
    template_id: str
    input: Dict[str, Any] = Field(default_factory=dict)


class ExecuteResponse(BaseModel):
    """执行响应"""
    execution_id: str
    status: ExecutionStatus
    message: str
