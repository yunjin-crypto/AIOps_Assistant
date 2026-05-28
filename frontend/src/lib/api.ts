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