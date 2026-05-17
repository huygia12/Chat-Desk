import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.models.ai_assistant_message import AIAssistantMessage
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.ai_assistant import (
    AIAssistantAskRequest,
    AIAssistantAskResponse,
    AIAssistantHistoryPageOut,
)
from app.services.ai_assistant_service import generate_internal_assistant_answer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai-assistant", tags=["ai-assistant"])

ASSISTANT_ROLE_ORDER = case(
    (AIAssistantMessage.role == "assistant", 1),
    else_=0,
)


async def _get_accessible_conversation(
    conversation_id: uuid.UUID | None,
    current_user: User,
    business_id: uuid.UUID,
    db: AsyncSession,
) -> Conversation | None:
    if not conversation_id:
        return None

    filters = [
        Conversation.id == conversation_id,
        Conversation.business_id == business_id,
    ]
    if current_user.role == "employee":
        filters.append(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(select(Conversation).where(*filters))
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/history", response_model=AIAssistantHistoryPageOut)
async def get_ai_assistant_history(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    before: uuid.UUID | None = Query(None),
):
    business_id = get_effective_business_id(current_user)
    filters = [
        AIAssistantMessage.business_id == business_id,
        AIAssistantMessage.user_id == current_user.id,
    ]

    if before:
        cursor_result = await db.execute(
            select(AIAssistantMessage).where(
                AIAssistantMessage.id == before,
                AIAssistantMessage.business_id == business_id,
                AIAssistantMessage.user_id == current_user.id,
            )
        )
        cursor_message = cursor_result.scalar_one_or_none()
        if not cursor_message:
            raise HTTPException(status_code=400, detail="Invalid assistant history cursor")

        cursor_role_order = 1 if cursor_message.role == "assistant" else 0
        filters.append(
            or_(
                AIAssistantMessage.created_at < cursor_message.created_at,
                and_(
                    AIAssistantMessage.created_at == cursor_message.created_at,
                    ASSISTANT_ROLE_ORDER < cursor_role_order,
                ),
                and_(
                    AIAssistantMessage.created_at == cursor_message.created_at,
                    ASSISTANT_ROLE_ORDER == cursor_role_order,
                    AIAssistantMessage.id < cursor_message.id,
                ),
            )
        )

    result = await db.execute(
        select(AIAssistantMessage)
        .where(*filters)
        .order_by(
            AIAssistantMessage.created_at.desc(),
            ASSISTANT_ROLE_ORDER.desc(),
            AIAssistantMessage.id.desc(),
        )
        .limit(limit + 1)
    )
    messages_desc = result.scalars().all()
    has_more = len(messages_desc) > limit
    page_desc = messages_desc[:limit]
    items = list(reversed(page_desc))

    return {
        "items": items,
        "has_more": has_more,
        "next_cursor": items[0].id if has_more and items else None,
    }


@router.post("/ask", response_model=AIAssistantAskResponse)
async def ask_ai_assistant(
    data: AIAssistantAskRequest,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question is required")

    conversation = await _get_accessible_conversation(data.conversation_id, current_user, business_id, db)

    try:
        answer = await generate_internal_assistant_answer(
            db=db,
            business_id=business_id,
            user_id=current_user.id,
            question=question,
            conversation=conversation,
        )
    except Exception as exc:
        logger.error("Internal AI assistant failed for user %s: %s", current_user.id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="AI assistant failed to answer")

    user_message = AIAssistantMessage(
        business_id=business_id,
        user_id=current_user.id,
        conversation_id=data.conversation_id,
        role="user",
        content=question,
    )
    assistant_message = AIAssistantMessage(
        business_id=business_id,
        user_id=current_user.id,
        conversation_id=data.conversation_id,
        role="assistant",
        content=answer,
    )
    db.add(user_message)
    db.add(assistant_message)
    await db.flush()
    await db.refresh(user_message)
    await db.refresh(assistant_message)

    return {
        "answer": answer,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }
