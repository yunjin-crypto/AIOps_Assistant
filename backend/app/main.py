from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.log import router as log_router
from app.api.agent import router as agent_router
from app.api.rag import router as rag_router
from app.api.workflow import router as workflow_router
from app.core.config import settings

app = FastAPI(
    title="AI Ops Assistant"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    chat_router,
    prefix="/api",
    tags=["Chat"]
)

app.include_router(
    log_router,
    prefix="/api",
    tags=["Log"]
)

app.include_router(
    agent_router,
    prefix="/api"
)

app.include_router(
    rag_router,
    prefix="/api",
    tags=["RAG"]
)

app.include_router(
    workflow_router,
    prefix="/api",
    tags=["Workflow"]
)


@app.on_event("startup")
async def startup():
    """启动时预加载 BGE-M3 模型，避免首次 RAG 查询卡死"""
    from app.services.embedding_service import preload_model
    await preload_model()


@app.get("/")
async def root():
    return {
        "status": "ok"
    }