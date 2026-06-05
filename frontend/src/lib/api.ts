// api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * 内部通用的 POST 请求工具函数
 * @param endpoint 接口路径 (例如 '/api/chat')
 * @param body 请求体对象
 */
async function apiPost<T>(endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败 (状态码: ${response.status})`);
  }

  return response.json();
}

/**
 * 内部通用的 GET 请求工具函数
 */
async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`请求失败 (状态码: ${response.status})`);
  }
  return response.json();
}

/**
 * 内部通用的 PUT 请求工具函数
 */
async function apiPut<T>(endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败 (状态码: ${response.status})`);
  }

  return response.json();
}

/**
 * 内部通用的 DELETE 请求工具函数
 */
async function apiDelete<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`请求失败 (状态码: ${response.status})`);
  }
  return response.json();
}

// ==================== 公共类型 ====================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ==================== 以下是对外导出的业务接口 ====================

// 1. AI 聊天接口 — 支持多轮对话
export async function sendMessage(messages: ChatMessage[]) {
  return apiPost<{ answer: string }>("/api/chat", { messages });
}

// 2. 日志分析接口
export async function analyzeLog(logText: string) {
  return apiPost<{ result: string }>("/api/log", { log_text: logText });
}

// 3. 智能诊断接口 (Agent) - 可选传入日志分析JSON作为上下文
export async function diagnoseWithAgent(
  content: string,
  logAnalysis?: Record<string, unknown> | null
) {
  return apiPost<{ result: string }>("/api/agent", {
    content,
    log_analysis: logAnalysis ?? null,
  });
}

// ==================== RAG 知识库接口 ====================

export interface SourceInfo {
  filename: string;
  preview: string;
  score: number;
}

export interface DocumentInfo {
  filename: string;
  chunks: number;
}

// 4. RAG 问答（热插拔核心：根据 mode 路由到不同的 LLM）
export async function ragQuery(
  question: string,
  mode: "chat" | "log" | "agent" = "chat",
  topK: number = 5,
  logAnalysis?: Record<string, unknown> | null,
  messages?: ChatMessage[] | null
) {
  return apiPost<{ answer: string; sources: SourceInfo[] }>("/api/rag/query", {
    question,
    mode,
    top_k: topK,
    log_analysis: logAnalysis ?? null,
    messages: messages ?? null,
  });
}

// 5. 获取已上传文档列表
export async function getRagDocuments() {
  return apiGet<{ documents: DocumentInfo[] }>("/api/rag/documents");
}

// 6. 删除指定文档
export async function deleteRagDocument(filename: string) {
  return apiDelete<{ success: boolean; message: string }>(
    `/api/rag/documents/${encodeURIComponent(filename)}`
  );
}

// 7. 上传文档（multipart/form-data）
export async function uploadRagDocument(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/rag/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`上传失败: ${detail}`);
  }

  return response.json();
}

// ==================== Workflow 编排接口 ====================

// --- 类型定义 ---

export type StepType = "chat" | "log_analysis" | "agent_diagnosis" | "rag_query";

export interface StepDef {
  id: string;
  type: StepType;
  input_mapping: Record<string, unknown>;
  depends_on: string[];
  config: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: StepDef[];
  output_step: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowTemplateListItem {
  id: string;
  name: string;
  description: string;
  step_count: number;
  output_step: string;
  created_at?: string;
  updated_at?: string;
}

export type ExecutionStatus = "pending" | "running" | "success" | "failed";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface StepResult {
  step_id: string;
  step_type: StepType;
  status: StepStatus;
  input?: Record<string, unknown> | null;
  output?: unknown;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface WorkflowExecution {
  id: string;
  template_id: string;
  template_name: string;
  status: ExecutionStatus;
  trigger_input: Record<string, unknown>;
  step_results: Record<string, StepResult>;
  final_output?: unknown;
  error?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface WorkflowExecutionListItem {
  id: string;
  template_id: string;
  template_name: string;
  status: ExecutionStatus;
  step_count: number;
  completed_steps: number;
  created_at?: string | null;
  finished_at?: string | null;
}

// --- API 函数 ---

// 8. 获取模板列表
export async function listWorkflowTemplates() {
  return apiGet<{ templates: WorkflowTemplateListItem[] }>(
    "/api/workflow/templates"
  );
}

// 9. 获取模板详情（含完整步骤 DAG）
export async function getWorkflowTemplate(templateId: string) {
  return apiGet<WorkflowTemplate>(
    `/api/workflow/templates/${encodeURIComponent(templateId)}`
  );
}

// 10. 同步执行 Workflow（等待完成后返回完整结果）
export async function executeWorkflowSync(
  templateId: string,
  input: Record<string, unknown>
) {
  return apiPost<WorkflowExecution>("/api/workflow/execute-sync", {
    template_id: templateId,
    input,
  });
}

// 11. 异步执行 Workflow（立即返回执行 ID）
export async function executeWorkflowAsync(
  templateId: string,
  input: Record<string, unknown>
) {
  return apiPost<{ execution_id: string; status: string; message: string }>(
    "/api/workflow/execute",
    {
      template_id: templateId,
      input,
    }
  );
}

// 12. 获取执行详情
export async function getWorkflowExecution(executionId: string) {
  return apiGet<WorkflowExecution>(
    `/api/workflow/executions/${encodeURIComponent(executionId)}`
  );
}

// 13. 获取执行历史
export async function listWorkflowExecutions(limit = 20) {
  return apiGet<{ executions: WorkflowExecutionListItem[] }>(
    `/api/workflow/executions?limit=${limit}`
  );
}

// 14. 创建 SSE 连接监听执行进度
export function createExecutionStream(
  executionId: string,
  onUpdate: (execution: WorkflowExecution) => void,
  onComplete: () => void,
  onError: (error: string) => void
): EventSource {
  const url = `${API_BASE_URL}/api/workflow/executions/${encodeURIComponent(executionId)}/stream`;
  const es = new EventSource(url);

  es.addEventListener("update", (e) => {
    try {
      const data = JSON.parse(e.data) as WorkflowExecution;
      onUpdate(data);
    } catch {
      // 忽略解析错误
    }
  });

  es.addEventListener("complete", () => {
    es.close();
    onComplete();
  });

  es.addEventListener("error", (e) => {
    es.close();
    try {
      const data = JSON.parse((e as MessageEvent).data || "{}");
      onError(data.error || "SSE 连接异常");
    } catch {
      onError("SSE 连接异常，请刷新页面重试");
    }
  });

  // EventSource 通用错误处理（网络断开等）
  es.onerror = () => {
    // readyState 2 = CLOSED，说明连接已终止
    if (es.readyState === EventSource.CLOSED) {
      onError("SSE 连接已断开");
    }
  };

  return es;
}