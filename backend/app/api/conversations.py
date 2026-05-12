import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.schemas.conversation import ConversationOut, ConversationAIToggle
from app.api.deps import get_current_business_or_employee, get_effective_business_id

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(Conversation)
        .options(joinedload(Conversation.contact).selectinload(Contact.labels))
        .where(Conversation.business_id == business_id)
        .order_by(Conversation.last_message_at.desc().nullslast())
    )
    return result.unique().scalars().all()


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(Conversation)
        .options(joinedload(Conversation.contact).selectinload(Contact.labels))
        .where(Conversation.id == conversation_id, Conversation.business_id == business_id)
    )
    conversation = result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.patch("/{conversation_id}/ai", response_model=ConversationOut)
async def toggle_ai(
    conversation_id: uuid.UUID,
    data: ConversationAIToggle,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(Conversation)
        .options(joinedload(Conversation.contact).selectinload(Contact.labels))
        .where(Conversation.id == conversation_id, Conversation.business_id == business_id)
    )
    conversation = result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.is_ai_enabled = data.is_ai_enabled
    await db.flush()
    return conversation
