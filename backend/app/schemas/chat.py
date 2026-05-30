from typing import List, Optional
from pydantic import BaseModel


class MessageItem(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str = ""  # 保留单条兼容
    messages: Optional[List[MessageItem]] = None  # 多轮对话历史


class ChatResponse(BaseModel):
    answer: str