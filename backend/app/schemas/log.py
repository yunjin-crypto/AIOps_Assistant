from pydantic import BaseModel

class LogRequest(BaseModel):
    log_text: str

class LogResponse(BaseModel):
    result: str