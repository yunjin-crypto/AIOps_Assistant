"use client";

import { useState, useRef, useEffect } from "react";
import { useRAG } from "./RAGProvider";

export default function RAGDrawer() {
  const {
    ragEnabled,
    topK,
    documents,
    toggleRAG,
    setTopK,
    uploadFile,
    deleteDocument,
    setDrawerOpen,
  } = useRAG();

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ESC 关闭抽屉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setDrawerOpen]);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "txt", "md"].includes(ext)) {
      setError(`不支持的文件类型: .${ext}`);
      return;
    }

    setError("");
    setUploading(true);
    try {
      await uploadFile(file);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "上传失败，请检查后端是否启动";
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
    // 重置 input 以便重复上传同一文件
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  };

  const handleDelete = async (filename: string) => {
    try {
      await deleteDocument(filename);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 半透明遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={() => setDrawerOpen(false)}
      />

      {/* 抽屉面板 */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:bg-slate-900/90 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📚</span> 知识库
          </h2>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* RAG 开关 */}
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                RAG 增强
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                开启后将从知识库中检索相关内容辅助回答
              </p>
            </div>
            <button
              onClick={toggleRAG}
              className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${
                ragEnabled ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
              role="switch"
              aria-checked={ragEnabled}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  ragEnabled ? "translate-x-[22px]" : "translate-x-[1px]"
                }`}
              />
            </button>
          </div>

          {/* Top-K 滑块 */}
          {ragEnabled && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  检索数量
                </label>
                <span className="text-sm font-bold text-green-600">{topK}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          )}

          {/* 文件上传区域 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
              📄 文档管理
            </h3>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                dragOver
                  ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                  : "border-slate-300 dark:border-slate-600 hover:border-green-400"
              }`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-slate-500">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="text-sm">解析中...</span>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  <p className="text-2xl mb-1">📁</p>
                  <p>拖拽或点击上传</p>
                  <p className="text-xs mt-1">支持 PDF / DOCX / TXT / MD</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileChange}
              className="hidden"
            />

            {error && (
              <p className="mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                {error}
              </p>
            )}
          </div>

          {/* 文档列表 */}
          <div>
            {documents.length > 0 ? (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.filename}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl group hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg shrink-0">
                        {doc.filename.endsWith(".pdf")
                          ? "📕"
                          : doc.filename.endsWith(".docx")
                          ? "📘"
                          : "📝"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-slate-400">
                          {doc.chunks} 个文本块
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.filename)}
                      className="shrink-0 ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition opacity-0 group-hover:opacity-100"
                      title="删除文档"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">
                暂无文档，上传一个试试
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
