"use client";

import { useState, useEffect } from "react";
import { diagnoseWithAgent, ragQuery, type SourceInfo } from "@/lib/api";
import { useRAG } from "@/components/RAGProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AgentPage() {
  const [content, setContent] = useState("");
  const [logJsonText, setLogJsonText] = useState("");
  const [showLogInput, setShowLogInput] = useState(false);

  // 从日志分析页面跳转过来时，自动加载 sessionStorage 中的分析结果
  useEffect(() => {
    const stored = sessionStorage.getItem("agent_log_context");
    if (stored) {
      // 尝试格式化 JSON
      try {
        const parsed = JSON.parse(stored);
        setLogJsonText(JSON.stringify(parsed, null, 2));
      } catch {
        setLogJsonText(stored);
      }
      setShowLogInput(true);
      // 消费后清除，避免下次进入时残留
      sessionStorage.removeItem("agent_log_context");
    }
  }, []);
  const [result, setResult] = useState("");
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const { ragEnabled, topK } = useRAG();

  const handleDiagnose = async () => {
    if (!content.trim()) return;

    // 解析用户粘贴的 JSON（如果提供了）
    let logAnalysis: Record<string, unknown> | null = null;
    if (logJsonText.trim()) {
      try {
        logAnalysis = JSON.parse(logJsonText);
        setJsonError("");
      } catch {
        setJsonError("日志分析 JSON 格式无效，请检查后重试");
        return;
      }
    }

    setLoading(true);
    setJsonError("");
    setSources([]);
    try {
      if (ragEnabled) {
        const data = await ragQuery(content, "agent", topK, logAnalysis);
        setResult(data.answer);
        setSources(data.sources);
      } else {
        const data = await diagnoseWithAgent(content, logAnalysis);
        setResult(data.result);
      }
    } catch (error) {
      console.error(error);
      setResult("诊断失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto h-[calc(100vh-3rem)] flex flex-col">
        {/* 标题 */}
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 mb-6 text-center">
          🤖 智能诊断 Agent
        </h1>

        {/* 主内容卡片 */}
        <div className="flex-1 flex flex-col space-y-5 overflow-hidden">
          {/* 输入区域 */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 space-y-4">
            {/* 异常信息输入 */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                异常信息描述
              </label>
              <textarea
                rows={5}
                className="w-full border border-slate-200 rounded-xl p-4 bg-white/80 backdrop-blur-sm text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="描述异常现象，例如：生产环境 Nginx 返回 502 错误，后端服务是 Node.js..."
                disabled={loading}
              />
            </div>

            {/* 日志分析 JSON 输入 (可折叠) */}
            <div>
              <button
                type="button"
                onClick={() => setShowLogInput(!showLogInput)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide hover:text-purple-500 transition"
              >
                <span
                  className={`inline-block transition-transform ${
                    showLogInput ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
                日志分析 JSON (可选，作为诊断上下文)
              </button>
              {showLogInput && (
                <div className="mt-2">
                  <textarea
                    rows={8}
                    className="w-full border border-slate-200 rounded-xl p-4 bg-white/80 backdrop-blur-sm text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                    value={logJsonText}
                    onChange={(e) => setLogJsonText(e.target.value)}
                    placeholder={`粘贴日志分析结果 JSON，例如：\n{\n  "type": "磁盘空间不足",\n  "reason": "日志文件堆积",\n  "severity": "high",\n  "solution": ["清理日志", "扩容磁盘"]\n}`}
                    disabled={loading}
                  />
                  {jsonError && (
                    <p className="mt-1 text-xs text-red-500">{jsonError}</p>
                  )}
                </div>
              )}
            </div>

            {/* 发送按钮 */}
            <div className="flex justify-end">
              <button
                onClick={handleDiagnose}
                disabled={loading || !content.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-medium text-sm hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-purple-600/20 active:scale-95"
              >
                {loading ? "诊断中..." : "开始诊断"}
              </button>
            </div>
          </div>

          {/* 结果展示区域 */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/60 backdrop-blur-sm p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              诊断结果
            </h2>

            {/* 三种状态 */}
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-sm space-x-1.5">
                <span>正在智能诊断</span>
                <span className="inline-flex">
                  <span className="animate-pulse [animation-delay:0s]">.</span>
                  <span className="animate-pulse [animation-delay:0.2s]">.</span>
                  <span className="animate-pulse [animation-delay:0.4s]">.</span>
                </span>
              </div>
            ) : result ? (
              <div className="max-h-[500px] overflow-auto rounded-lg bg-slate-100 p-4 text-sm leading-relaxed dark:bg-slate-900">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0 text-slate-800 dark:text-slate-200">
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-bold text-slate-900 dark:text-white">
                        {children}
                      </strong>
                    ),
                    code: ({ className, children, ...props }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code
                          className="bg-purple-100 dark:bg-purple-900/30 px-1 py-0.5 rounded text-sm text-purple-700 dark:text-purple-300"
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-slate-200 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto my-2">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      );
                    },
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold text-purple-700 dark:text-purple-300 mt-4 mb-2">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-bold text-purple-600 dark:text-purple-400 mt-3 mb-1.5">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-1">
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1 ml-2 mb-2 text-slate-700 dark:text-slate-300">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1 ml-2 mb-2 text-slate-700 dark:text-slate-300">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-slate-700 dark:text-slate-300">{children}</li>
                    ),
                  }}
                >
                  {result}
                </ReactMarkdown>

                {/* RAG 参考来源 */}
                {sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      📎 参考来源
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {sources.map((s, i) => (
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
              <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm">
                <p>输入异常信息后点击"开始诊断"，结果将显示在这里</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
