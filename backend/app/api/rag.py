"""RAG 知识库 API 路由"""
from fastapi import APIRouter, HTTPException, UploadFile, File

from app.schemas.rag import (
    RAGQueryRequest,
    RAGQueryResponse,
    UploadResponse,
    DocumentListResponse,
    DeleteResponse,
)
from app.services.rag_service import rag_service
from app.services.document_service import ALLOWED_EXTENSIONS
import os

router = APIRouter()


@router.post("/rag/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """上传文档：自动解析 → 切片 → 向量化 → 存入 FAISS"""
    # 校验文件类型
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    try:
        content = await file.read()
        result = await rag_service.upload(content, file.filename)
        return UploadResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rag/query", response_model=RAGQueryResponse)
async def rag_query(request: RAGQueryRequest):
    """RAG 问答：检索知识库 + LLM 生成回答"""
    if request.mode not in ("chat", "log", "agent"):
        raise HTTPException(status_code=400, detail=f"不支持的模式: {request.mode}")

    try:
        result = await rag_service.query(
            question=request.question,
            mode=request.mode,
            top_k=request.top_k,
            log_analysis=request.log_analysis,
            messages=request.messages,
        )
        return RAGQueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rag/documents", response_model=DocumentListResponse)
async def list_documents():
    """列出已上传的文档"""
    try:
        docs = rag_service.list_documents()
        return DocumentListResponse(documents=docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/rag/documents/{filename:path}", response_model=DeleteResponse)
async def delete_document(filename: str):
    """删除指定文档及其向量"""
    try:
        result = rag_service.delete_document(filename)
        return DeleteResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
