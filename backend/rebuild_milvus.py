"""Rebuild Milvus product embeddings from PostgreSQL products.

Usage:
    python rebuild_milvus.py
    python rebuild_milvus.py --reset-collection
"""

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.database import async_session
from app.models.product import Product
from app.services.embedding_service import get_embedding
from app.services.milvus_service import (
    connect_milvus,
    disconnect_milvus,
    flush_collection,
    reset_collection,
    upsert_embedding,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _build_product_text(product: Product) -> str:
    parts = [product.name]
    if product.description:
        parts.append(product.description)
    if product.price is not None:
        parts.append(f"Gia: {product.price:,.0f} VND")
    parts.append(f"Tinh trang: {'Con hang' if product.status == 'available' else 'Het hang'}")
    if product.extra_info:
        parts.append(f"Thong tin them: {product.extra_info}")
    return " - ".join(parts)


async def rebuild(reset: bool) -> None:
    connect_milvus()
    try:
        if reset:
            reset_collection()

        async with async_session() as db:
            result = await db.execute(select(Product).order_by(Product.created_at.asc()))
            products = result.scalars().all()

            for index, product in enumerate(products, 1):
                text = _build_product_text(product)
                embedding = await get_embedding(text)
                upsert_embedding(str(product.id), str(product.business_id), embedding)
                logger.info("Rebuilt embedding %s/%s: %s", index, len(products), product.name)

        flush_collection()
        logger.info("Milvus rebuild completed: %s product(s)", len(products))
    finally:
        disconnect_milvus()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset-collection",
        action="store_true",
        help="Drop and recreate the Milvus collection before re-indexing products.",
    )
    args = parser.parse_args()
    asyncio.run(rebuild(reset=args.reset_collection))


if __name__ == "__main__":
    main()
