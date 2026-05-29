const API_BASE_URL = "http://127.0.0.1:8000";

export async function sendMessage(message: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
      }),
    }
  );

  if (!response.ok) {
    throw new Error("请求失败");
  }

  return response.json();
}

export async function analyzeLog(logText: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/log`, 
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      log_text: logText, // 注意：后端接收的字段是 log_text
    }),
  });

  if (!response.ok) {
    throw new Error("日志分析请求失败");
  }

  return response.json();
}