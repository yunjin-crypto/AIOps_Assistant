from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    LLM_PROVIDER: str = "mock"

    OPENAI_API_KEY: str = ""

    OPENAI_BASE_URL: str = ""

    class Config:
        env_file = ".env"


settings = Settings()