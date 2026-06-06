"""
Milvus Cloud (Zilliz) vector database service for product embedding storage & retrieval.
No local Docker or pgvector needed.
"""

import logging
import time
from pymilvus import MilvusClient
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

COLLECTION_NAME = "product_embeddings"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2

_client: MilvusClient | None = None


# ── connection ────────────────────────────────────────────────────────────────

def connect_milvus() -> None:
    """Connect to Milvus Cloud (Zilliz). Call once at startup."""
    global _client
    if not settings.MILVUS_URI:
        raise RuntimeError("MILVUS_URI is not configured")

    _client = MilvusClient(
        uri=settings.MILVUS_URI,
        token=settings.MILVUS_TOKEN or None,
    )
    _ensure_collection()
    _client.load_collection(COLLECTION_NAME)
    logger.info(f"Connected to Milvus Cloud: {settings.MILVUS_URI[:50]}...")


def disconnect_milvus() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
    logger.info("Disconnected from Milvus Cloud")


def _get_client() -> MilvusClient:
    global _client
    if _client is None:
        logger.warning("Milvus client is not connected; attempting lazy reconnect")
        connect_milvus()
    return _client


def is_connected() -> bool:
    return _client is not None


# ── collection management ────────────────────────────────────────────────────

def _ensure_collection() -> None:
    """Create the collection + index if it does not exist yet."""
    client = _get_client()

    if not client.has_collection(COLLECTION_NAME):
        from pymilvus import DataType

        schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
        schema.add_field(field_name="id", datatype=DataType.VARCHAR, is_primary=True, max_length=36)
        schema.add_field(field_name="business_id", datatype=DataType.VARCHAR, max_length=36)
        schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM)

        index_params = client.prepare_index_params()
        index_params.add_index(
            field_name="embedding",
            metric_type="COSINE",
            index_type="AUTOINDEX",
        )

        client.create_collection(
            collection_name=COLLECTION_NAME,
            schema=schema,
            index_params=index_params,
        )
        logger.info(f"Created Milvus collection '{COLLECTION_NAME}' with COSINE AUTOINDEX")
    else:
        logger.info(f"Milvus collection '{COLLECTION_NAME}' already exists")


def reset_collection() -> None:
    """Drop and recreate the product embedding collection."""
    client = _get_client()
    if client.has_collection(COLLECTION_NAME):
        client.drop_collection(COLLECTION_NAME)
        logger.warning(f"Dropped Milvus collection '{COLLECTION_NAME}'")
    _ensure_collection()


def flush_collection() -> None:
    client = _get_client()
    client.flush(COLLECTION_NAME)


# ── CRUD operations ──────────────────────────────────────────────────────────

def upsert_embedding(product_id: str, business_id: str, embedding: list[float]) -> None:
    """Insert or update a single product embedding."""
    client = _get_client()
    client.upsert(
        collection_name=COLLECTION_NAME,
        data=[{
            "id": product_id,
            "business_id": business_id,
            "embedding": embedding,
        }],
    )


def delete_embedding(product_id: str) -> None:
    """Delete embedding for a product."""
    client = _get_client()
    client.delete(
        collection_name=COLLECTION_NAME,
        filter=f'id == "{product_id}"',
    )


def search_similar(
    business_id: str,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[str]:
    """
    Search for the most similar product embeddings scoped to a business.
    Returns list of product_id strings ordered by similarity.
    """
    return [item["id"] for item in search_similar_with_scores(business_id, query_embedding, top_k)]


def search_similar_with_scores(
    business_id: str,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[dict[str, str | float]]:
    """
    Search for similar products and return product IDs with Milvus scores.
    For the COSINE metric used by this collection, higher scores are better.
    """
    client = _get_client()
    results = None
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            results = client.search(
                collection_name=COLLECTION_NAME,
                data=[query_embedding],
                anns_field="embedding",
                search_params={"metric_type": "COSINE"},
                limit=top_k,
                filter=f'business_id == "{business_id}"',
                output_fields=["id"],
                consistency_level="Eventually",
                timeout=10,
            )
            break
        except Exception as exc:
            last_error = exc
            if "Timestamp lag too large" not in str(exc) or attempt == 2:
                raise
            logger.warning("Milvus search timestamp lag; retrying attempt %s/3", attempt + 2)
            try:
                client.load_collection(COLLECTION_NAME)
            except Exception as load_error:
                logger.warning("Failed to reload Milvus collection before retry: %s", load_error)
            time.sleep(0.5 * (attempt + 1))

    if results is None:
        raise last_error or RuntimeError("Milvus search returned no results")

    hits: list[dict[str, str | float]] = []
    for hit in results[0]:
        product_id = hit.get("id") or (hit.get("entity") or {}).get("id")
        score = hit.get("distance", hit.get("score", 0.0))
        if product_id:
            hits.append({"id": str(product_id), "score": float(score)})
    return hits
