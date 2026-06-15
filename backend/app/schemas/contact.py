import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.label import LabelOut


class ContactOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    platform: str
    platform_user_id: str
    display_name: str | None = None
    profile_pic_url: str | None = None
    visitor_email: str | None = None
    visitor_phone: str | None = None
    visitor_address: str | None = None
    labels: list[LabelOut] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}
