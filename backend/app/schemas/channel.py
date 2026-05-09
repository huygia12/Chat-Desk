import uuid
from datetime import datetime
from pydantic import BaseModel


class ChannelCreate(BaseModel):
    platform_page_id: str
    page_name: str | None = None
    access_token: str


class ChannelOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    platform: str
    platform_page_id: str
    page_name: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
