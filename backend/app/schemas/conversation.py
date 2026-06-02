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
    unread_count: int = 0

    model_config = {"from_attributes": True}


class ConversationPageOut(BaseModel):
    items: list[ConversationOut]
    has_more: bool
    next_cursor: str | None = None


class ConversationAIToggle(BaseModel):
    is_ai_enabled: bool


class ConversationAssignUpdate(BaseModel):
    assigned_to_id: uuid.UUID | None = None
    assigned_to_business: bool | None = None


class ConversationHistoryEventOut(BaseModel):
    id: str
    type: str
    action: str
    created_at: datetime
    actor_id: uuid.UUID | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    from_assignee_id: uuid.UUID | None = None
    from_assignee_name: str | None = None
    from_assignee_email: str | None = None
    to_assignee_id: uuid.UUID | None = None
    to_assignee_name: str | None = None
    to_assignee_email: str | None = None
    label_id: uuid.UUID | None = None
    label_name: str | None = None
    label_color: str | None = None


class ConversationReadResponse(BaseModel):
    status: str
    unread_count: int = 0
