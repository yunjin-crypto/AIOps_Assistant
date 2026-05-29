"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-8 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 text-center space-y-6">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
          AI 运维平台
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          选择要使用的功能
        </p>

        <div className="space-y-3">
          <Link
            href="/chat"
            className="block w-full px-6 py-3 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 active:scale-95"
          >
            💬 智能对话
          </Link>

          <Link
            href="/log"
            className="block w-full px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition shadow-sm active:scale-95 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            📋 日志分析
          </Link>
        </div>
      </div>
    </main>
  );
}