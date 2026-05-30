"use client";

import { RAGProvider } from "@/components/RAGProvider";
import RAGFloatingButton from "@/components/RAGFloatingButton";

export default function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RAGProvider>
      {children}
      <RAGFloatingButton />
    </RAGProvider>
  );
}
