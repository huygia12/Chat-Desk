from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/chatdesk"

    @property
    def db_url(self) -> str:
        """Ensure DATABASE_URL uses asyncpg driver (Railway provides postgresql://)"""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    # JWT
    SECRET_KEY: str = "chatdesk-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Groq LLM
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Embedding
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Milvus Cloud (Zilliz)
    MILVUS_URI: str = ""
    MILVUS_TOKEN: str = ""

    # Facebook
    FB_APP_ID: str = ""
    FB_APP_SECRET: str = ""
    FB_VERIFY_TOKEN: str = "chatdesk_verify_token"
    FB_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/channels/facebook/callback"
    FB_CONFIG_ID: str = ""  # Facebook Login for Business Configuration ID

    # Frontend URL (for OAuth redirect, privacy page, etc.)
    FRONTEND_URL: str = "http://localhost:5173"

    # CORS (comma-separated origins)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
