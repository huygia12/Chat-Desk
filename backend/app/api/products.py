import json
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.i18n import t
from app.models.user import User
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut
from app.api.deps import get_current_business
from app.services.embedding_service import get_embedding
from app.services.milvus_service import upsert_embedding, delete_embedding

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/products", tags=["products"])


def _format_extra_info(extra_info: dict | None) -> str | None:
    if not extra_info:
        return None
    return json.dumps(extra_info, ensure_ascii=False, sort_keys=True)


def _build_product_text(
    name: str,
    description: str | None,
    price: float | None,
    status: str,
    extra_info: dict | None = None,
    sku: str | None = None,
    category: str | None = None,
    stock_quantity: int | None = None,
) -> str:
    """Build text for embedding from product fields."""
    parts = [name]
    if sku:
        parts.append(f"SKU: {sku}")
    if category:
        parts.append(f"Danh mục: {category}")
    if description:
        parts.append(description)
    if price is not None:
        parts.append(f"Giá: {price:,.0f} VND")
    parts.append(f"Tình trạng: {'Còn hàng' if status == 'available' else 'Hết hàng'}")
    if stock_quantity is not None:
        parts.append(f"Số lượng tồn kho: {stock_quantity}")
    formatted_extra = _format_extra_info(extra_info)
    if formatted_extra:
        parts.append(f"Thông tin thêm: {formatted_extra}")
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
        sku=data.sku,
        category=data.category,
        description=data.description,
        price=data.price,
        stock_quantity=data.stock_quantity,
        status=data.status,
        extra_info=data.extra_info,
    )
    db.add(product)
    await db.flush()
    await db.refresh(product)

    # Store embedding in Milvus
    text = _build_product_text(
        data.name,
        data.description,
        data.price,
        data.status,
        data.extra_info,
        data.sku,
        data.category,
        data.stock_quantity,
    )
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

    update_fields = data.model_fields_set
    if "name" in update_fields:
        product.name = data.name
    if "sku" in update_fields:
        product.sku = data.sku
    if "category" in update_fields:
        product.category = data.category
    if "description" in update_fields:
        product.description = data.description
    if "price" in update_fields:
        product.price = data.price
    if "stock_quantity" in update_fields:
        product.stock_quantity = data.stock_quantity
    if "status" in update_fields:
        product.status = data.status
    if "extra_info" in update_fields:
        product.extra_info = data.extra_info

    # Re-generate embedding in Milvus
    text = _build_product_text(
        product.name,
        product.description,
        product.price,
        product.status,
        product.extra_info,
        product.sku,
        product.category,
        product.stock_quantity,
    )
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
    return {"detail": t("Product deleted")}


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
            sku=data.sku,
            category=data.category,
            description=data.description,
            price=data.price,
            stock_quantity=data.stock_quantity,
            status=data.status,
            extra_info=data.extra_info,
        )
        db.add(product)
        await db.flush()
        await db.refresh(product)

        # Store embedding in Milvus
        try:
            text = _build_product_text(
                data.name,
                data.description,
                data.price,
                data.status,
                data.extra_info,
                data.sku,
                data.category,
                data.stock_quantity,
            )
            embedding = await get_embedding(text)
            upsert_embedding(str(product.id), str(current_user.id), embedding)
        except Exception as e:
            logger.warning(f"Embedding failed for product {product.name}: {e}")

        created.append(product)

    return created
