import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.conversation_assignment import AssignmentSetting, ConversationAssignmentHistory
from app.schemas.conversation import ConversationOut, ConversationAIToggle, ConversationAssignUpdate
from app.api.deps import get_current_business_or_employee, get_effective_business_id

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


async def _get_assignment_setting(
    business_id: uuid.UUID,
    db: AsyncSession,
) -> AssignmentSetting:
    result = await db.execute(
        select(AssignmentSetting).where(AssignmentSetting.business_id == business_id)
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting

    setting = AssignmentSetting(business_id=business_id, employee_assignment_locked=False)
    db.add(setting)
    await db.flush()
    return setting


def _conversation_query():
    return select(Conversation).options(
        joinedload(Conversation.contact).selectinload(Contact.labels),
        joinedload(Conversation.assigned_to),
    )


def _assignment_action(from_assignee_id: uuid.UUID | None, to_assignee_id: uuid.UUID | None) -> str:
    if to_assignee_id is None:
        return "unassigned"
    if from_assignee_id is None:
        return "assigned"
    return "reassigned"


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    query = _conversation_query().where(Conversation.business_id == business_id)
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(
        query.order_by(Conversation.last_message_at.desc().nullslast())
    )
    return result.unique().scalars().all()


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    query = _conversation_query().where(
        Conversation.id == conversation_id,
        Conversation.business_id == business_id,
    )
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(
        query
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
    query = _conversation_query().where(
        Conversation.id == conversation_id,
        Conversation.business_id == business_id,
    )
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(
        query
    )
    conversation = result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.is_ai_enabled = data.is_ai_enabled
    await db.flush()
    return conversation


@router.patch("/{conversation_id}/assignee", response_model=ConversationOut)
async def update_assignee(
    conversation_id: uuid.UUID,
    data: ConversationAssignUpdate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    query = _conversation_query().where(
        Conversation.id == conversation_id,
        Conversation.business_id == business_id,
    )
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(query)
    conversation = result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    setting = await _get_assignment_setting(business_id, db)
    if current_user.role == "employee" and setting.employee_assignment_locked:
        raise HTTPException(status_code=403, detail="Employee assignment changes are locked")

    assignee_id = data.assigned_to_id
    if assignee_id is not None:
        employee_result = await db.execute(
            select(User).where(
                User.id == assignee_id,
                User.business_id == business_id,
                User.role == "employee",
                User.is_active == True,
            )
        )
        if not employee_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Assignee not found")

    from_assignee_id = conversation.assigned_to_id
    if from_assignee_id == assignee_id:
        return conversation

    conversation.assigned_to_id = assignee_id
    db.add(
        ConversationAssignmentHistory(
            conversation_id=conversation.id,
            business_id=business_id,
            actor_id=current_user.id,
            from_assignee_id=from_assignee_id,
            to_assignee_id=assignee_id,
            action=_assignment_action(from_assignee_id, assignee_id),
        )
    )
    await db.flush()

    refreshed = await db.execute(_conversation_query().where(Conversation.id == conversation.id))
    return refreshed.unique().scalar_one()
