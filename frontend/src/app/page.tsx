"use client";

import { useState } from "react";
import { sendMessage } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;

    const userMessage = input;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userMessage,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const data = await sendMessage(userMessage);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "请求失败",
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">
        AI 运维助手
      </h1>

      <div className="border rounded p-4 h-[500px] overflow-y-auto">
        {messages.map((msg, index) => (
          <div
            key={index}
            className="mb-4"
          >
            <b>
              {msg.role === "user"
                ? "用户"
                : "AI"}
              ：
            </b>

            {msg.content}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <input
          className="border flex-1 p-2 rounded"
          value={input}
          onChange={(e) =>
            setInput(e.target.value)
          }
          placeholder="请输入问题..."
        />

        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 border rounded"
        >
          {loading ? "发送中..." : "发送"}
        </button>
      </div>
    </main>
  );
}