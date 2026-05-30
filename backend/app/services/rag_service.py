"""RAG 编排服务"""
import json
from typing import List, Dict, Optional

import numpy as np

from app.services.embedding_service import encode, encode_sync
from app.services.vector_store import vector_store
from app.services.document_service import (
    process_file,
    save_uploaded_file,
    delete_uploaded_file,
)
from app.services.llm_service import chat_service, log_service, agent_service
from services.prompt_service import RAG_CONTEXT_TEMPLATE

# 模式 → LLM 服务映射
MODE_SERVICES = {
    "chat": chat_service,
    "log": log_service,
    "agent": agent_service,
}


class RAGService:
    """RAG 编排：文件上传 → 解析 → 分块 → 向量化 → 存储 → 检索 → 生成"""

    # ---------- 上传 ----------

    async def upload(self, file_content: bytes, filename: str) -> dict:
        # 1. 保存文件到 data/docs/
        file_path = save_uploaded_file(file_content, filename)

        # 2. 解析 + 切片
        chunks = process_file(file_path, filename)
        if not chunks:
            return {
                "success": False,
                "filename": filename,
                "chunks": 0,
                "message": "文件内容为空或无法解析",
            }

        # 3. 提取文本列表
        texts = [c["text"] for c in chunks]

        # 4. BGE-M3 向量化
        embeddings = await encode(texts)

        # 5. 存入 FAISS
        metas = [{"filename": c["filename"], "chunk_index": c["chunk_index"], "text": c["text"]} for c in chunks]
        vector_store.add(embeddings, metas)

        return {
            "success": True,
            "filename": filename,
            "chunks": len(chunks),
            "message": f"成功解析 {len(chunks)} 个文本块并已向量化存储",
        }

    # ---------- 查询 ----------

    async def query(
        self,
        question: str,
        mode: str = "chat",
        top_k: int = 5,
        log_analysis: Optional[dict] = None,
        messages: Optional[List[dict]] = None,
    ) -> dict:
        # 1. 向量化问题
        query_vec = await encode([question])
        query_vec = np.array(query_vec, dtype=np.float32)

        # 2. FAISS 检索
        retrieved = vector_store.search(query_vec, k=top_k)

        # 3. 构建 RAG 上下文
        if retrieved:
            context_parts = []
            for i, r in enumerate(retrieved):
                context_parts.append(
                    f"[{i + 1}] (来源: {r['filename']})\n{r['text']}"
                )
            context = "\n\n".join(context_parts)

            # 用 RAG 模板包装用户问题
            augmented_message = RAG_CONTEXT_TEMPLATE.format(
                context=context,
                question=question,
            )
        else:
            # 没有检索到内容时，直接使用原问题
            augmented_message = question

        # 4. 调用对应模式的 LLM 服务
        service = MODE_SERVICES.get(mode, chat_service)

        if mode == "agent":
            result = await service.generate(augmented_message, log_analysis=log_analysis)
        elif mode == "chat" and messages:
            # 多轮对话模式：将最后一条 user 消息替换为 RAG 增强版本
            augmented_messages = [dict(m) for m in messages]
            # 找到最后一条 user 消息并替换
            for i in range(len(augmented_messages) - 1, -1, -1):
                if augmented_messages[i]["role"] == "user":
                    augmented_messages[i]["content"] = augmented_message
                    break
            result = await service.generate(
                user_content="",
                messages=augmented_messages,
            )
        else:
            result = await service.generate(augmented_message)

        # 5. 构建来源信息
        sources = []
        seen = set()
        for r in retrieved:
            if r["filename"] not in seen:
                seen.add(r["filename"])
                preview = r["text"][:80].replace("\n", " ")
                sources.append({
                    "filename": r["filename"],
                    "preview": preview + ("..." if len(r["text"]) > 80 else ""),
                    "score": r["score"],
                })

        return {
            "answer": result,
            "sources": sources,
        }

    # ---------- 文档管理 ----------

    def list_documents(self) -> List[dict]:
        return vector_store.get_documents()

    def delete_document(self, filename: str) -> dict:
        removed = vector_store.delete_by_filename(filename)
        delete_uploaded_file(filename)
        return {
            "success": True,
            "filename": filename,
            "message": f"已删除文档及其 {removed} 个向量块",
        }


# 全局单例
rag_service = RAGService()
