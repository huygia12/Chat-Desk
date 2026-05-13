import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class SavedReplyCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    shortcut: str = Field(..., min_length=1, max_length=80)
    visibility: str
    content: str = Field(..., min_length=1)


class SavedReplyUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    shortcut: str = Field(..., min_length=1, max_length=80)
    content: str = Field(..., min_length=1)


class SavedReplyOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    owner_id: uuid.UUID | None = None
    visibility: str
    title: str
    shortcut: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
