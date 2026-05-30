"""FAISS 向量存储服务"""
import json
import os
import threading
from typing import List, Dict, Optional

import numpy as np

VECTOR_DIM = 1024
DATA_FAISS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "faiss")
DATA_FAISS_DIR = os.path.abspath(DATA_FAISS_DIR)

INDEX_PATH = os.path.join(DATA_FAISS_DIR, "index.faiss")
META_PATH = os.path.join(DATA_FAISS_DIR, "metadata.json")

_write_lock = threading.Lock()


class VectorStore:
    """FAISS 向量存储封装，使用 IndexIDMap + IndexFlatIP (余弦相似度)"""

    def __init__(self):
        self.index = None
        self.metadata: Dict[str, dict] = {}  # {str(id): {filename, chunk_index, text}}
        self._next_id = 0
        self._load_or_create()

    def _load_or_create(self):
        os.makedirs(DATA_FAISS_DIR, exist_ok=True)

        if os.path.exists(INDEX_PATH) and os.path.exists(META_PATH):
            import faiss
            self.index = faiss.read_index(INDEX_PATH)
            with open(META_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            # 将 JSON 的字符串 key 保持为字符串（FAISS ID 是 int64，但 JSON key 必须是字符串）
            self.metadata = raw
            # 计算下一个可用 ID
            if self.metadata:
                self._next_id = max(int(k) for k in self.metadata.keys()) + 1
        else:
            import faiss
            base_index = faiss.IndexFlatIP(VECTOR_DIM)
            self.index = faiss.IndexIDMap(base_index)
            self.metadata = {}
            self._next_id = 0
            self._save()

    def _save(self):
        import faiss
        with _write_lock:
            os.makedirs(DATA_FAISS_DIR, exist_ok=True)
            faiss.write_index(self.index, INDEX_PATH)
            with open(META_PATH, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, ensure_ascii=False, indent=2)

    def add(self, vectors: np.ndarray, metas: List[dict]) -> List[int]:
        """
        添加向量和元数据
        vectors: shape=(n, 1024), 已归一化的 float32 数组
        metas: [{filename, chunk_index, text}, ...]
        返回分配的 ID 列表
        """
        n = vectors.shape[0]
        ids = np.arange(self._next_id, self._next_id + n, dtype=np.int64)
        self.index.add_with_ids(vectors, ids)

        for i, meta in enumerate(metas):
            str_id = str(self._next_id + i)
            self.metadata[str_id] = {
                "filename": meta["filename"],
                "chunk_index": meta["chunk_index"],
                "text": meta["text"],
            }

        self._next_id += n
        self._save()
        return ids.tolist()

    def search(self, query_vector: np.ndarray, k: int = 5) -> List[dict]:
        """
        检索 top-k 相似向量
        query_vector: shape=(1, 1024), 已归一化
        返回: [{filename, chunk_index, text, score}, ...]
        """
        if len(self.metadata) == 0:
            return []

        distances, indices = self.index.search(query_vector, k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            str_idx = str(idx)
            if idx != -1 and str_idx in self.metadata:
                meta = self.metadata[str_idx]
                results.append({
                    "filename": meta["filename"],
                    "chunk_index": meta["chunk_index"],
                    "text": meta["text"],
                    "score": round(float(dist), 4),
                })

        return results

    def delete_by_filename(self, filename: str) -> int:
        """删除指定文件的所有向量，返回删除数量"""
        ids_to_remove = [
            int(k) for k, v in self.metadata.items()
            if v.get("filename") == filename
        ]

        if not ids_to_remove:
            return 0

        import faiss
        ids_array = np.array(ids_to_remove, dtype=np.int64)
        selector = faiss.IDSelectorArray(ids_array)
        removed = self.index.remove_ids(selector)

        # 清理 metadata
        for id_val in ids_to_remove:
            self.metadata.pop(str(id_val), None)

        self._save()
        return len(ids_to_remove)

    def get_documents(self) -> List[dict]:
        """获取已索引的文档列表（按文件名聚合）"""
        docs: Dict[str, dict] = {}
        for meta in self.metadata.values():
            fname = meta["filename"]
            if fname not in docs:
                docs[fname] = {"filename": fname, "chunks": 0}
            docs[fname]["chunks"] += 1
        return list(docs.values())

    def has_documents(self) -> bool:
        return len(self.metadata) > 0


# 全局单例
vector_store = VectorStore()
