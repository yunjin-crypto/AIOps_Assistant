from pydantic import BaseModel
from typing import Optional, Dict, Any

class AgentRequest(BaseModel):
    content: str
    log_analysis: Optional[Dict[str, Any]] = None

class AgentResponse(BaseModel):
    result: str