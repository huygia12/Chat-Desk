import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

_groq_client = None
_openai_client = None


def get_llm_provider() -> str:
    provider = get_settings().LLM_PROVIDER.strip().lower()
    if provider not in {"groq", "openai"}:
        raise ValueError("LLM_PROVIDER must be either 'groq' or 'openai'")
    return provider


def get_llm_model() -> str:
    settings = get_settings()
    provider = get_llm_provider()
    return settings.OPENAI_MODEL if provider == "openai" else settings.GROQ_MODEL


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        settings = get_settings()
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is required when LLM_PROVIDER=groq")
        from groq import AsyncGroq

        _groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _groq_client


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        settings = get_settings()
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        from openai import AsyncOpenAI

        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


async def create_chat_completion(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
):
    settings = get_settings()
    provider = get_llm_provider()

    if provider == "openai":
        client = _get_openai_client()
        logger.debug("Generating chat completion with OpenAI model %s", settings.OPENAI_MODEL)
        return await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            temperature=temperature,
            max_completion_tokens=max_tokens,
        )

    client = _get_groq_client()
    logger.debug("Generating chat completion with Groq model %s", settings.GROQ_MODEL)
    return await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
