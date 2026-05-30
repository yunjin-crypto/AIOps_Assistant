// api.ts
const API_BASE_URL = "http://127.0.0.1:8000";

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

// ==================== 以下是对外导出的业务接口 ====================

// 1. AI 聊天接口
export async function sendMessage(message: string) {
  return apiPost<{ answer: string }>("/api/chat", { message });
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