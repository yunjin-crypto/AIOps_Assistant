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