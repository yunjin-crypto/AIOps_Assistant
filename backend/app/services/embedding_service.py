"""BGE-M3 向量化服务 - 全局单例"""
import asyncio
from typing import List

import numpy as np

# 延迟加载，避免在未安装时导入失败
_model = None
_model_lock = asyncio.Lock()

MODEL_NAME = "BAAI/bge-m3"
VECTOR_DIM = 1024


def _load_model():
    """同步加载模型（在启动时调用一次）"""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_model():
    """获取模型实例（确保已加载）"""
    global _model
    if _model is None:
        _load_model()
    return _model


def encode_sync(texts: List[str]) -> np.ndarray:
    """
    同步编码文本列表
    返回归一化后的 numpy 数组，shape=(n, 1024)
    """
    model = get_model()
    # BGE-M3 使用 normalize_embeddings=True 做 L2 归一化
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return np.array(embeddings, dtype=np.float32)


async def encode(texts: List[str]) -> np.ndarray:
    """异步包装 encode_sync，避免阻塞事件循环"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, encode_sync, texts)


async def preload_model():
    """
    在服务启动时预加载 BGE-M3 模型。

    如果不预加载，首个 RAG 查询会触发延迟加载（CPU 上约 20-30 秒），
    导致前端请求超时 / 卡死。
    """
    import logging
    logger = logging.getLogger("uvicorn.info")
    logger.info("正在加载 BGE-M3 嵌入模型 (BAAI/bge-m3)，首次启动可能需要 20-30 秒...")
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_model)
    logger.info("BGE-M3 模型加载完成")
