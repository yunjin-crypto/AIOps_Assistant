from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm_service import chat_service

router = APIRouter()


@router.post(
    "/chat",
    response_model=ChatResponse
)
async def chat(request: ChatRequest):

    try:

        answer = await chat_service.generate(
            user_content=request.message,
            messages=[m.model_dump() for m in request.messages] if request.messages else None,
        )

        return ChatResponse(
            answer=answer
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )