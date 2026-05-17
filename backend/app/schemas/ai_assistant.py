import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AIAssistantAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None


class AIAssistantMessageOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    user_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AIAssistantAskResponse(BaseModel):
    answer: str
    user_message: AIAssistantMessageOut
    assistant_message: AIAssistantMessageOut


class AIAssistantHistoryPageOut(BaseModel):
    items: list[AIAssistantMessageOut]
    has_more: bool
    next_cursor: uuid.UUID | None = None
