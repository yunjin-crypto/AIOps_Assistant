from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.log import router as log_router
from app.api.agent import router as agent_router

app = FastAPI(
    title="AI Ops Assistant"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000"
    ],
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

@app.get("/")
async def root():
    return {
        "status": "ok"
    }