import asyncio
import logging
from functools import lru_cache
from sentence_transformers import SentenceTransformer
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
        logger.info("Embedding model loaded successfully")
    return _model


async def get_embedding(text: str) -> list[float]:
    """Generate embedding vector for text using sentence-transformers (runs in thread pool)."""
    loop = asyncio.get_event_loop()
    model = _get_model()
    embedding = await loop.run_in_executor(None, lambda: model.encode(text).tolist())
    return embedding


async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts at once."""
    loop = asyncio.get_event_loop()
    model = _get_model()
    embeddings = await loop.run_in_executor(None, lambda: model.encode(texts).tolist())
    return embeddings
