import uuid
from datetime import datetime
from pydantic import BaseModel
from app.schemas.contact import ContactOut


class AssigneeOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    full_name: str | None = None
    business_name: str | None = None

    model_config = {"from_attributes": True}


class ConversationChannelOut(BaseModel):
    id: uuid.UUID
    platform: str
    page_name: str | None = None
    widget_id: str | None = None
    allowed_origins: str | None = None

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    channel_id: uuid.UUID
    contact_id: uuid.UUID
    platform: str
    status: str = "open"
    assigned_to_id: uuid.UUID | None = None
    assigned_to_business: bool = False
    last_message_at: datetime | None = None
    is_ai_enabled: bool
    created_at: datetime
    contact: ContactOut | None = None
    assigned_to: AssigneeOut | None = None
    channel: ConversationChannelOut | None = None

    model_config = {"from_attributes": True}


class ConversationAIToggle(BaseModel):
    is_ai_enabled: bool


class ConversationAssignUpdate(BaseModel):
    assigned_to_id: uuid.UUID | None = None
    assigned_to_business: bool | None = None
