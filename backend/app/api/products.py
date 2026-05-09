import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut
from app.api.deps import get_current_business
from app.services.embedding_service import get_embedding
from app.services.milvus_service import upsert_embedding, delete_embedding

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/products", tags=["products"])


def _build_product_text(name: str, description: str | None, price: float | None, status: str) -> str:
    """Build text for embedding from product fields."""
    parts = [name]
    if description:
        parts.append(description)
    if price is not None:
        parts.append(f"Giá: {price:,.0f} VND")
    parts.append(f"Tình trạng: {'Còn hàng' if status == 'available' else 'Hết hàng'}")
    return " - ".join(parts)


@router.get("", response_model=list[ProductOut])
async def list_products(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.business_id == current_user.id).order_by(Product.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ProductOut)
async def create_product(
    data: ProductCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    product = Product(
        business_id=current_user.id,
        name=data.name,
        description=data.description,
        price=data.price,
        status=data.status,
        extra_info=data.extra_info,
    )
    db.add(product)
    await db.flush()
    await db.refresh(product)

    # Store embedding in Milvus
    text = _build_product_text(data.name, data.description, data.price, data.status)
    embedding = await get_embedding(text)
    upsert_embedding(str(product.id), str(current_user.id), embedding)

    return product


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.business_id == current_user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if data.name is not None:
        product.name = data.name
    if data.description is not None:
        product.description = data.description
    if data.price is not None:
        product.price = data.price
    if data.status is not None:
        product.status = data.status
    if data.extra_info is not None:
        product.extra_info = data.extra_info

    # Re-generate embedding in Milvus
    text = _build_product_text(product.name, product.description, product.price, product.status)
    embedding = await get_embedding(text)
    upsert_embedding(str(product.id), str(current_user.id), embedding)

    await db.flush()
    await db.refresh(product)
    return product


@router.delete("/{product_id}")
async def delete_product(
    product_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.business_id == current_user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Remove embedding from Milvus
    delete_embedding(str(product.id))

    await db.delete(product)
    return {"detail": "Product deleted"}


@router.post("/import", response_model=list[ProductOut])
async def import_products(
    products: list[ProductCreate],
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import products (max 50 at a time)."""
    if len(products) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 products per import")

    created = []
    for data in products:
        product = Product(
            business_id=current_user.id,
            name=data.name,
            description=data.description,
            price=data.price,
            status=data.status,
            extra_info=data.extra_info,
        )
        db.add(product)
        await db.flush()
        await db.refresh(product)

        # Store embedding in Milvus
        try:
            text = _build_product_text(data.name, data.description, data.price, data.status)
            embedding = await get_embedding(text)
            upsert_embedding(str(product.id), str(current_user.id), embedding)
        except Exception as e:
            logger.warning(f"Embedding failed for product {product.name}: {e}")

        created.append(product)

    return created
