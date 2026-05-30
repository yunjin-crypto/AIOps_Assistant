"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  getRagDocuments,
  uploadRagDocument,
  deleteRagDocument,
  type DocumentInfo,
} from "@/lib/api";

// ---------- Context 类型 ----------

interface RAGContextType {
  ragEnabled: boolean;
  topK: number;
  documents: DocumentInfo[];
  drawerOpen: boolean;
  toggleRAG: () => void;
  setTopK: (k: number) => void;
  uploadFile: (file: File) => Promise<void>;
  deleteDocument: (filename: string) => Promise<void>;
  refreshDocuments: () => Promise<void>;
  setDrawerOpen: (open: boolean) => void;
}

const RAGContext = createContext<RAGContextType | null>(null);

// ---------- Provider ----------

export function RAGProvider({ children }: { children: ReactNode }) {
  const [ragEnabled, setRagEnabled] = useState(false);
  const [topK, setTopK] = useState(5);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshDocuments = useCallback(async () => {
    try {
      const data = await getRagDocuments();
      setDocuments(data.documents);
    } catch {
      // 后端未启动时静默失败
    }
  }, []);

  // 初始化时加载文档列表
  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const toggleRAG = useCallback(() => {
    setRagEnabled((prev) => !prev);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      await uploadRagDocument(file);
      await refreshDocuments();
    },
    [refreshDocuments]
  );

  const deleteDocument = useCallback(
    async (filename: string) => {
      await deleteRagDocument(filename);
      await refreshDocuments();
    },
    [refreshDocuments]
  );

  return (
    <RAGContext.Provider
      value={{
        ragEnabled,
        topK,
        documents,
        drawerOpen,
        toggleRAG,
        setTopK,
        uploadFile,
        deleteDocument,
        refreshDocuments,
        setDrawerOpen,
      }}
    >
      {children}
    </RAGContext.Provider>
  );
}

// ---------- Hook ----------

export function useRAG() {
  const ctx = useContext(RAGContext);
  if (!ctx) {
    throw new Error("useRAG must be used within a RAGProvider");
  }
  return ctx;
}
