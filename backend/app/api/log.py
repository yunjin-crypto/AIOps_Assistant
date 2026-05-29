from fastapi import APIRouter, HTTPException

from app.schemas.log import LogRequest, LogResponse
from app.services.llm_service_log import llm_service

router = APIRouter()


@router.post(
    "/log",
    response_model=LogResponse
)
async def analyze_log(request: LogRequest):

    try:

        result = await llm_service.generate(
            request.log_text
        )

        return LogResponse(
            result=result
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )