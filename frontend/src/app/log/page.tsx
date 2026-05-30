"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeLog, ragQuery, type SourceInfo } from "@/lib/api";
import { useRAG } from "@/components/RAGProvider";

export default function LogPage() {
  const [log, setLog] = useState("");
  const [result, setResult] = useState("");
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { ragEnabled, topK } = useRAG();

  const analyze = async () => {
    if (!log.trim()) return;

    setLoading(true);
    setSources([]);
    try {
      if (ragEnabled) {
        const data = await ragQuery(log, "log", topK);
        setResult(data.answer);
        setSources(data.sources);
      } else {
        const data = await analyzeLog(log);
        setResult(data.result);
      }
    } catch (error) {
      console.error(error);
      setResult("分析失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  // 将日志分析结果传递给 Agent 页面
  const sendToAgent = () => {
    if (!result) return;
    sessionStorage.setItem("agent_log_context", result);
    router.push("/agent");
  };

  // 尝试解析结果为 JSON 以美化展示
  const formattedResult = (() => {
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return result;
    }
  })();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto h-[calc(100vh-3rem)] flex flex-col">
        {/* 标题 */}
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 mb-6 text-center">
          📋 日志分析
        </h1>

        {/* 主内容卡片 */}
        <div className="flex-1 flex flex-col space-y-5 overflow-hidden">
          {/* 输入区域 */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700">
            <textarea
              rows={12}
              className="w-full border border-slate-200 rounded-xl p-4 bg-white/80 backdrop-blur-sm text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="粘贴日志内容..."
              disabled={loading}
            />

            <div className="mt-3 flex justify-end">
              <button
                onClick={analyze}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-600/20 active:scale-95"
              >
                {loading ? "分析中..." : "分析日志"}
              </button>
            </div>
          </div>

          {/* 结果展示区域 */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/60 backdrop-blur-sm p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                分析结果
              </h2>
              {result && !loading && (
                <button
                  onClick={sendToAgent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-medium hover:from-purple-700 hover:to-pink-600 transition shadow-sm active:scale-95"
                  title="将分析结果发送到智能诊断 Agent 进行深入诊断"
                >
                  🤖 发送到 Agent 诊断
                </button>
              )}
            </div>

            {/* 三种状态：加载中、有结果、空状态 */}
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-sm space-x-1.5">
                <span>正在分析日志</span>
                <span className="inline-flex">
                  <span className="animate-pulse [animation-delay:0s]">.</span>
                  <span className="animate-pulse [animation-delay:0.2s]">.</span>
                  <span className="animate-pulse [animation-delay:0.4s]">.</span>
                </span>
              </div>
            ) : result ? (
              <div>
                <pre className="max-h-[400px] overflow-auto rounded-lg bg-slate-100 p-4 text-sm font-mono text-slate-800 leading-relaxed whitespace-pre-wrap dark:bg-slate-900 dark:text-slate-200">
                  {formattedResult}
                </pre>

                {/* RAG 参考来源 */}
                {sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                      📎 参考来源
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {sources.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-xs text-green-700 dark:text-green-300"
                          title={s.preview}
                        >
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
                <p>点击"分析日志"后，结果将显示在这里</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
