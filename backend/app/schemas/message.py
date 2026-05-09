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
    created_at: datetime

    model_config = {"from_attributes": True}
