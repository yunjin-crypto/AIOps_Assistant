"use client";

import { useState, useRef, useEffect } from "react";
import { sendMessage, ragQuery, type SourceInfo, type ChatMessage } from "@/lib/api";
import { useRAG } from "@/components/RAGProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: SourceInfo[];
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { ragEnabled, topK } = useRAG();
  const MAX_ROUNDS = 10; // 保留最近 10 轮对话

  // 自动滚动到最新消息
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    // 构建多轮对话 history：最近 MAX_ROUNDS-1 轮 + 当前新消息
    const recentHistory = messages.slice(-(MAX_ROUNDS * 2 - 2));
    const fullMessages: ChatMessage[] = [...recentHistory, userMessage].map(
      (m) => ({ role: m.role, content: m.content })
    );

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      let answer: string;
      let sources: SourceInfo[] | undefined;

      if (ragEnabled) {
        const data = await ragQuery(input, "chat", topK, null, fullMessages);
        answer = data.answer;
        sources = data.sources;
      } else {
        const data = await sendMessage(fullMessages);
        answer = data.answer;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          sources,
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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto h-[calc(100vh-3rem)] flex flex-col">
        {/* 标题 */}
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 mb-6 text-center">
          AI 运维助手
        </h1>

        {/* 对话框容器 */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white/60 backdrop-blur-sm p-4 sm:p-6 space-y-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 mt-20">
              <p className="text-lg">👋 我是你的 AI 运维助手</p>
              <p className="text-sm mt-1">输入任何运维问题，我会尽快回复</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        code: ({ className, children, ...props }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm" {...props}>
                              {children}
                            </code>
                          ) : (
                            <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto my-2">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>

                    {/* RAG 参考来源 */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-600">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                          📎 参考来源
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-xs text-green-700 dark:text-green-300"
                              title={s.preview}
                            >
                              {s.filename.endsWith(".pdf")
                                ? "📕"
                                : s.filename.endsWith(".docx")
                                ? "📘"
                                : "📝"}
                              <span className="max-w-[120px] truncate">
                                {s.filename}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* 加载提示 */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm dark:bg-slate-700 dark:border-slate-600">
                <div className="flex space-x-1.5">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0s]"></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.15s]"></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.3s]"></span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 输入区域 */}
        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-xl px-4 py-3 bg-white/80 backdrop-blur-sm text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入运维问题，按 Enter 发送..."
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-600/20 active:scale-95"
          >
            {loading ? "发送中" : "发送"}
          </button>
        </div>
      </div>
    </main>
  );
}