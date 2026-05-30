import json
from typing import Optional, Dict, Any

from openai import AsyncOpenAI

from app.core.config import settings
from services.prompt_service import LOG_ANALYSIS_PROMPT, SYSTEM_PROMPT, AGENT_PROMPT


class LLMService:

    def __init__(
        self,
        system_prompt: str,
        model: str = "deepseek-v4-flash",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        self.system_prompt = system_prompt
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )

    async def generate(
        self,
        user_content: str,
        log_analysis: Optional[Dict[str, Any]] = None,
    ) -> str:

        # 如果传入了 log_analysis，将其作为上下文拼入 user message
        if log_analysis:
            log_context = json.dumps(log_analysis, ensure_ascii=False, indent=2)
            full_content = (
                f"以下为日志分析引擎输出的结构化诊断结果，请参考该结果进行故障诊断：\n\n"
                f"【日志分析JSON】\n{log_context}\n\n"
                f"【原始异常信息】\n{user_content}"
            )
        else:
            full_content = user_content

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": self.system_prompt,
                },
                {
                    "role": "user",
                    "content": full_content,
                }
            ],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        return response.choices[0].message.content


chat_service = LLMService(system_prompt=SYSTEM_PROMPT)
log_service = LLMService(system_prompt=LOG_ANALYSIS_PROMPT)
agent_service = LLMService(system_prompt=AGENT_PROMPT)
