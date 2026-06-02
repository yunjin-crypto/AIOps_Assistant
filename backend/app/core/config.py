from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    LLM_PROVIDER: str = "mock"

    OPENAI_API_KEY: str = ""

    OPENAI_BASE_URL: str = ""

    EMBEDDING_API_KEY: str = ""

    EMBEDDING_BASE_URL: str = "https://api.siliconflow.cn/v1"

    ALLOWED_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()