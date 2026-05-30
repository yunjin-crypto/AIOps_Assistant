from fastapi import APIRouter, HTTPException


from app.services.llm_service import agent_service
from app.schemas.agent import AgentRequest, AgentResponse

router = APIRouter()


@router.post(
    "/agent",
    response_model=AgentResponse
)
async def diagnose(request: AgentRequest):

    try:

        result = await agent_service.generate(
            request.content,
            log_analysis=request.log_analysis,
        )

        return AgentResponse(
            result=result
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )