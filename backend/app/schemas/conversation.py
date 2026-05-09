import uuid
from datetime import datetime
from pydantic import BaseModel
from app.schemas.contact import ContactOut


class ConversationOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    channel_id: uuid.UUID
    contact_id: uuid.UUID
    platform: str
    last_message_at: datetime | None = None
    is_ai_enabled: bool
    created_at: datetime
    contact: ContactOut | None = None

    model_config = {"from_attributes": True}


class ConversationAIToggle(BaseModel):
    is_ai_enabled: bool
