import logging
import asyncio
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_groq_client = None
_openai_client = None
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
GEMINI_MAX_RETRIES = 2
GEMINI_TIMEOUT_SECONDS = 30.0


@dataclass
class _ChatMessage:
    content: str | None


@dataclass
class _ChatChoice:
    message: _ChatMessage


@dataclass
class _ChatCompletion:
    choices: list[_ChatChoice]


def get_llm_provider() -> str:
    provider = get_settings().LLM_PROVIDER.strip().lower()
    if provider not in {"groq", "openai", "gemini"}:
        raise ValueError("LLM_PROVIDER must be one of: 'groq', 'openai', 'gemini'")
    return provider


def get_llm_model() -> str:
    settings = get_settings()
    provider = get_llm_provider()
    if provider == "openai":
        return settings.OPENAI_MODEL
    if provider == "gemini":
        return settings.GEMINI_MODEL
    return settings.GROQ_MODEL


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


async def _create_groq_chat_completion(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
):
    settings = get_settings()
    client = _get_groq_client()
    logger.debug("Generating chat completion with Groq model %s", settings.GROQ_MODEL)
    return await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _build_gemini_payload(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> dict:
    system_parts = []
    contents = []

    for message in messages:
        role = (message.get("role") or "user").strip().lower()
        content = (message.get("content") or "").strip()
        if not content:
            continue

        if role == "system":
            system_parts.append({"text": content})
            continue

        gemini_role = "model" if role == "assistant" else "user"
        part = {"text": content}
        if contents and contents[-1]["role"] == gemini_role:
            contents[-1]["parts"].append(part)
        else:
            contents.append({"role": gemini_role, "parts": [part]})

    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Continue."}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_parts:
        payload["systemInstruction"] = {"parts": system_parts}
    return payload


def _gemini_text_from_response(data: dict) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback") or {}
        block_reason = feedback.get("blockReason")
        if block_reason:
            raise RuntimeError(f"Gemini API blocked the prompt: {block_reason}")
        return ""

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    return "".join(part.get("text", "") for part in parts).strip()


async def _create_gemini_chat_completion(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> _ChatCompletion:
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")

    model = settings.GEMINI_MODEL.removeprefix("models/")
    model_path = quote(model, safe="")
    url = f"{GEMINI_API_BASE_URL}/models/{model_path}:generateContent"
    payload = _build_gemini_payload(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    logger.debug("Generating chat completion with Gemini model %s", settings.GEMINI_MODEL)
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT_SECONDS) as client:
        for attempt in range(GEMINI_MAX_RETRIES + 1):
            try:
                response = await client.post(
                    url,
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": settings.GEMINI_API_KEY,
                    },
                    json=payload,
                )
                if response.status_code not in GEMINI_RETRY_STATUS_CODES:
                    response.raise_for_status()
                    text = _gemini_text_from_response(response.json())
                    return _ChatCompletion(choices=[_ChatChoice(message=_ChatMessage(content=text))])

                detail = response.text[:1000]
                last_error = RuntimeError(
                    f"Gemini API request failed with HTTP {response.status_code}: {detail}"
                )
                logger.warning(
                    "Gemini API transient error on attempt %s/%s: HTTP %s",
                    attempt + 1,
                    GEMINI_MAX_RETRIES + 1,
                    response.status_code,
                )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = RuntimeError(f"Gemini API request failed: {exc}")
                logger.warning(
                    "Gemini API transport error on attempt %s/%s: %s",
                    attempt + 1,
                    GEMINI_MAX_RETRIES + 1,
                    exc,
                )
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:1000]
                raise RuntimeError(
                    f"Gemini API request failed with HTTP {exc.response.status_code}: {detail}"
                ) from exc

            if attempt < GEMINI_MAX_RETRIES:
                await asyncio.sleep(0.6 * (2 ** attempt))

    raise last_error or RuntimeError("Gemini API request failed")


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

    if provider == "gemini":
        try:
            return await _create_gemini_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            if not settings.GEMINI_FALLBACK_TO_GROQ:
                raise
            if not settings.GROQ_API_KEY:
                logger.warning(
                    "Gemini failed and Groq fallback is enabled, but GROQ_API_KEY is not set: %s",
                    exc,
                )
                raise
            logger.warning("Gemini failed; falling back to Groq model %s: %s", settings.GROQ_MODEL, exc)
            return await _create_groq_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

    return await _create_groq_chat_completion(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
