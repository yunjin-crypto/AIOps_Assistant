"""Embedding 向量化服务 - SiliconFlow API (BAAI/bge-m3)"""
import logging
from typing import List

import numpy as np
from openai import AsyncOpenAI

from app.core.config import settings

MODEL_NAME = "BAAI/bge-m3"
VECTOR_DIM = 1024

# 单次 API 调用最大文本数（保守值，避免超 token 上限）
MAX_TEXTS_PER_BATCH = 100

_client: AsyncOpenAI | None = None
_logger = logging.getLogger("uvicorn.info")


def _get_client() -> AsyncOpenAI:
    """懒加载 AsyncOpenAI 客户端"""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.EMBEDDING_API_KEY,
            base_url=settings.EMBEDDING_BASE_URL,
        )
    return _client


async def encode(texts: List[str]) -> np.ndarray:
    """
    调用 SiliconFlow Embedding API 编码文本列表。

    参数:
        texts: 待编码的文本列表

    返回:
        归一化后的 numpy 数组，shape=(n, 1024)，dtype=float32
    """
    if not texts:
        return np.empty((0, VECTOR_DIM), dtype=np.float32)

    client = _get_client()
    all_embeddings: list[list[float]] = []

    # 分批调用，避免单次请求超 token 上限
    for i in range(0, len(texts), MAX_TEXTS_PER_BATCH):
        batch = texts[i : i + MAX_TEXTS_PER_BATCH]
        response = await client.embeddings.create(
            model=MODEL_NAME,
            input=batch,
            encoding_format="float",
        )
        # 按 index 排序后收集
        sorted_items = sorted(response.data, key=lambda x: x.index)
        for item in sorted_items:
            all_embeddings.append(item.embedding)

    return np.array(all_embeddings, dtype=np.float32)


async def preload_model():
    """
    启动时验证 Embedding API 可用性。

    发送一条测试调用，确认 API Key 有效、网络可达。
    如果验证失败则抛出异常，阻止服务启动。
    """
    _logger.info("正在验证 SiliconFlow Embedding API (BAAI/bge-m3)...")
    try:
        await encode(["ping"])
        _logger.info("SiliconFlow Embedding API 验证通过")
    except Exception as e:
        _logger.error(f"Embedding API 验证失败: {e}")
        raise
