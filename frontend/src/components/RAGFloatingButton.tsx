"use client";

import { useRAG } from "./RAGProvider";
import RAGDrawer from "./RAGDrawer";

export default function RAGFloatingButton() {
  const { drawerOpen, setDrawerOpen, ragEnabled, documents } = useRAG();

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95 flex items-center justify-center"
        title="知识库 (RAG)"
      >
        <span className="text-2xl">📚</span>

        {/* RAG 开启指示器 */}
        {ragEnabled && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-300 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
        )}

        {/* 文档数量徽标 */}
        {documents.length > 0 && (
          <span className="absolute -bottom-1 -right-1 bg-white text-green-600 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center border border-green-200 px-1">
            {documents.length}
          </span>
        )}
      </button>

      {/* 侧边抽屉 */}
      {drawerOpen && <RAGDrawer />}
    </>
  );
}
