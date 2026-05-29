from openai import AsyncOpenAI

from app.core.config import settings
from services.prompt_service import SYSTEM_PROMPT


class LLMService:

    def __init__(self):

        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )

    async def generate(
        self,
        message: str,
    ) -> str:

        response = await self.client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": message,
                }
            ],
            temperature=0.7,
            max_tokens=2048,
        )

        return response.choices[0].message.content


llm_service = LLMService()