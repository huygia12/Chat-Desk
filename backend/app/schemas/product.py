import uuid
from datetime import datetime
from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: float | None = None
    status: str = "available"
    extra_info: dict | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    status: str | None = None
    extra_info: dict | None = None


class ProductOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    description: str | None = None
    price: float | None = None
    status: str
    extra_info: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
