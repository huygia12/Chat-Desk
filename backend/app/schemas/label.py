import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class LabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field("#d8d800", pattern=r"^#[0-9a-fA-F]{6}$")
    internal_note: str | None = None


class LabelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    internal_note: str | None = None


class LabelOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    name: str
    color: str
    internal_note: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContactLabelAssign(BaseModel):
    label_id: uuid.UUID
