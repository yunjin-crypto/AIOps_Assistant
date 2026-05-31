from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    LLM_PROVIDER: str = "mock"

    OPENAI_API_KEY: str = ""

    OPENAI_BASE_URL: str = ""

    EMBEDDING_API_KEY: str = ""

    EMBEDDING_BASE_URL: str = "https://api.siliconflow.cn/v1"

    class Config:
        env_file = ".env"


settings = Settings()