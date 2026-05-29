from openai import AsyncOpenAI

from app.core.config import settings
from services.prompt_service import LOG_ANALYSIS_PROMPT


class LLMService:

    def __init__(self):

        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )

    async def generate(
        self,
        log_text: str,
    ) -> str:

        response = await self.client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {
                    "role": "system",
                    "content": LOG_ANALYSIS_PROMPT,
                },
                {
                    "role": "user",
                    "content": log_text,
                }
            ],
            temperature=0.7,
            max_tokens=2048,
        )

        return response.choices[0].message.content


llm_service = LLMService()