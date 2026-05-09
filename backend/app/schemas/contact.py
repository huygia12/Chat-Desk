import uuid
from datetime import datetime
from pydantic import BaseModel


class ContactOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    platform: str
    platform_user_id: str
    display_name: str | None = None
    profile_pic_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
