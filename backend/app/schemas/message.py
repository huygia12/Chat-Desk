import uuid
from datetime import datetime
from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_type: str
    content: str
    platform_message_id: str | None = None
    attachment_url: str | None = None
    attachment_filename: str | None = None
    attachment_mime_type: str | None = None
    attachment_size: int | None = None
    attachment_kind: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessagePageOut(BaseModel):
    items: list[MessageOut]
    has_more: bool
    next_cursor: uuid.UUID | None = None
