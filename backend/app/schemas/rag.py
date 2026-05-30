"""RAG 模块数据模型"""
from typing import List, Optional
from pydantic import BaseModel


class RAGQueryRequest(BaseModel):
    question: str
    mode: str = "chat"  # "chat" | "log" | "agent"
    top_k: int = 5
    log_analysis: Optional[dict] = None  # 仅 agent 模式使用
    messages: Optional[list] = None  # 多轮对话历史，仅 chat 模式使用


class SourceInfo(BaseModel):
    filename: str
    preview: str
    score: float


class RAGQueryResponse(BaseModel):
    answer: str
    sources: List[SourceInfo]


class UploadResponse(BaseModel):
    success: bool
    filename: str
    chunks: int
    message: str


class DocumentInfo(BaseModel):
    filename: str
    chunks: int


class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]


class DeleteResponse(BaseModel):
    success: bool
    filename: str
    message: str
