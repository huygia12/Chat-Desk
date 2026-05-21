import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.conversation_assignment import (
    AssignmentSetting,
    ConversationAssignmentHistory,
    ConversationLabelHistory,
)
from app.models.conversation_read_state import ConversationReadState
from app.models.label import Label
from app.models.label import contact_labels
from app.models.message import Message
from app.schemas.conversation import (
    ConversationHistoryEventOut,
    ConversationOut,
    ConversationPageOut,
    ConversationReadResponse,
    ConversationAIToggle,
    ConversationAssignUpdate,
)
from app.api.deps import get_current_business_or_employee, get_effective_business_id

router = APIRouter(prefix="/api/conversations", tags=["conversations"])
CONVERSATION_PAGE_MAX_LIMIT = 100


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

    setting = AssignmentSetting(
        business_id=business_id,
        employee_assignment_locked=False,
        auto_assign_enabled=False,
        auto_assign_strategy="round_robin",
        channel_assignment_rules={},
        label_assignment_rules={},
    )
    db.add(setting)
    await db.flush()
    return setting


def _conversation_query():
    return select(Conversation).options(
        joinedload(Conversation.contact).selectinload(Contact.labels),
        joinedload(Conversation.assigned_to),
        joinedload(Conversation.channel),
    )


def _encode_conversation_cursor(conversation: Conversation) -> str:
    sort_time = conversation.last_message_at or conversation.created_at
    return f"{sort_time.isoformat()}|{conversation.id}"


def _decode_conversation_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        sort_time_raw, conversation_id_raw = cursor.split("|", 1)
        return datetime.fromisoformat(sort_time_raw), uuid.UUID(conversation_id_raw)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid conversation cursor")


def _assignment_action(
    from_assignee_id: uuid.UUID | None,
    to_assignee_id: uuid.UUID | None,
    to_business: bool = False,
) -> str:
    if to_business:
        return "assigned_business"
    if to_assignee_id is None:
        return "unassigned"
    if from_assignee_id is None:
        return "assigned"
    return "reassigned"


def _user_display_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.business_name or user.email


async def _apply_unread_counts(
    db: AsyncSession,
    current_user: User,
    conversations: list[Conversation],
) -> None:
    conversation_ids = [conversation.id for conversation in conversations]
    if not conversation_ids:
        return

    result = await db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .outerjoin(
            ConversationReadState,
            and_(
                ConversationReadState.conversation_id == Message.conversation_id,
                ConversationReadState.user_id == current_user.id,
            ),
        )
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.sender_type == "contact",
            or_(
                ConversationReadState.last_read_at.is_(None),
                Message.created_at > ConversationReadState.last_read_at,
            ),
        )
        .group_by(Message.conversation_id)
    )
    counts = {conversation_id: count for conversation_id, count in result.all()}
    for conversation in conversations:
        conversation.unread_count = counts.get(conversation.id, 0)


async def _get_visible_conversation(
    conversation_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> Conversation:
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
    return conversation


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
    conversations = result.unique().scalars().all()
    await _apply_unread_counts(db, current_user, conversations)
    return conversations


@router.get("/page", response_model=ConversationPageOut)
async def list_conversations_page(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
    limit: int = 30,
    cursor: str | None = None,
    search: str | None = None,
    platform: str | None = None,
    status: str | None = None,
    label_id: uuid.UUID | None = None,
    assignment: str = "all",
):
    limit = min(max(limit, 1), CONVERSATION_PAGE_MAX_LIMIT)
    business_id = get_effective_business_id(current_user)

    query = _conversation_query().where(Conversation.business_id == business_id)
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    if platform:
        query = query.where(Conversation.platform == platform)
    if status:
        query = query.where(Conversation.status == status)
    if assignment == "unassigned":
        query = query.where(Conversation.assigned_to_id.is_(None))
    elif assignment == "assigned":
        query = query.where(Conversation.assigned_to_id.is_not(None))
    elif assignment == "me":
        query = query.where(Conversation.assigned_to_id == current_user.id)
    elif assignment == "business":
        query = query.where(Conversation.assigned_to_business == True)

    if search:
        like_value = f"%{search.strip()}%"
        query = query.join(Contact, Conversation.contact_id == Contact.id).where(
            or_(
                Contact.display_name.ilike(like_value),
                Contact.platform_user_id.ilike(like_value),
                Contact.visitor_email.ilike(like_value),
                Contact.visitor_phone.ilike(like_value),
            )
        )

    if label_id:
        query = query.join(contact_labels, Conversation.contact_id == contact_labels.c.contact_id).where(
            contact_labels.c.label_id == label_id
        )

    if cursor:
        cursor_time, cursor_id = _decode_conversation_cursor(cursor)
        sort_time = func.coalesce(Conversation.last_message_at, Conversation.created_at)
        query = query.where(
            or_(
                sort_time < cursor_time,
                and_(sort_time == cursor_time, Conversation.id < cursor_id),
            )
        )

    sort_time = func.coalesce(Conversation.last_message_at, Conversation.created_at)
    result = await db.execute(
        query.order_by(
            sort_time.desc(),
            Conversation.id.desc(),
        ).limit(limit + 1)
    )
    conversations = result.unique().scalars().all()
    page_items = conversations[:limit]
    await _apply_unread_counts(db, current_user, page_items)
    return {
        "items": page_items,
        "has_more": len(conversations) > limit,
        "next_cursor": _encode_conversation_cursor(page_items[-1]) if len(conversations) > limit and page_items else None,
    }


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_visible_conversation(conversation_id, current_user, db)
    await _apply_unread_counts(db, current_user, [conversation])
    return conversation


@router.post("/{conversation_id}/read", response_model=ConversationReadResponse)
async def mark_conversation_read(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_visible_conversation(conversation_id, current_user, db)
    business_id = get_effective_business_id(current_user)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(ConversationReadState).where(
            ConversationReadState.conversation_id == conversation.id,
            ConversationReadState.user_id == current_user.id,
        )
    )
    state = result.scalar_one_or_none()
    if state is None:
        state = ConversationReadState(
            conversation_id=conversation.id,
            user_id=current_user.id,
            business_id=business_id,
            last_read_at=now,
        )
        db.add(state)
    else:
        state.last_read_at = now

    await db.commit()
    conversation.unread_count = 0
    return {"status": "ok", "unread_count": 0}


@router.get("/{conversation_id}/history", response_model=list[ConversationHistoryEventOut])
async def get_conversation_history(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    query = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.business_id == business_id,
    )
    if current_user.role == "employee":
        query = query.where(Conversation.assigned_to_id == current_user.id)

    conversation_result = await db.execute(query)
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    assignment_result = await db.execute(
        select(ConversationAssignmentHistory)
        .where(
            ConversationAssignmentHistory.conversation_id == conversation.id,
            ConversationAssignmentHistory.business_id == business_id,
        )
        .order_by(ConversationAssignmentHistory.created_at.desc())
    )
    assignment_history = assignment_result.scalars().all()

    label_result = await db.execute(
        select(ConversationLabelHistory)
        .where(
            ConversationLabelHistory.conversation_id == conversation.id,
            ConversationLabelHistory.business_id == business_id,
        )
        .order_by(ConversationLabelHistory.created_at.desc())
    )
    label_history = label_result.scalars().all()

    user_ids = {business_id}
    for item in assignment_history:
        user_ids.add(item.actor_id)
        if item.from_assignee_id:
            user_ids.add(item.from_assignee_id)
        if item.to_assignee_id:
            user_ids.add(item.to_assignee_id)
    for item in label_history:
        user_ids.add(item.actor_id)

    users_by_id = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {user.id: user for user in users_result.scalars().all()}

    label_ids = {item.label_id for item in label_history}
    labels_by_id = {}
    if label_ids:
        labels_result = await db.execute(select(Label).where(Label.id.in_(label_ids)))
        labels_by_id = {label.id: label for label in labels_result.scalars().all()}

    events = [
        ConversationHistoryEventOut(
            id=f"conversation:{conversation.id}",
            type="conversation",
            action="created",
            created_at=conversation.created_at,
            actor_id=business_id,
            actor_name=_user_display_name(users_by_id.get(business_id)),
            actor_email=users_by_id.get(business_id).email if users_by_id.get(business_id) else None,
        )
    ]

    for item in assignment_history:
        actor = users_by_id.get(item.actor_id)
        from_assignee = users_by_id.get(item.from_assignee_id)
        to_assignee = users_by_id.get(item.to_assignee_id)
        events.append(
            ConversationHistoryEventOut(
                id=f"assignment:{item.id}",
                type="assignment",
                action=item.action,
                created_at=item.created_at,
                actor_id=item.actor_id,
                actor_name=_user_display_name(actor),
                actor_email=actor.email if actor else None,
                from_assignee_id=item.from_assignee_id,
                from_assignee_name=_user_display_name(from_assignee),
                from_assignee_email=from_assignee.email if from_assignee else None,
                to_assignee_id=item.to_assignee_id,
                to_assignee_name=_user_display_name(to_assignee),
                to_assignee_email=to_assignee.email if to_assignee else None,
            )
        )

    for item in label_history:
        actor = users_by_id.get(item.actor_id)
        label = labels_by_id.get(item.label_id)
        events.append(
            ConversationHistoryEventOut(
                id=f"label:{item.id}",
                type="label",
                action=item.action,
                created_at=item.created_at,
                actor_id=item.actor_id,
                actor_name=_user_display_name(actor),
                actor_email=actor.email if actor else None,
                label_id=item.label_id,
                label_name=label.name if label else None,
                label_color=label.color if label else None,
            )
        )

    return sorted(events, key=lambda event: event.created_at, reverse=True)


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
    assigned_to_business = bool(data.assigned_to_business)
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
        assigned_to_business = False

    from_assignee_id = conversation.assigned_to_id
    if from_assignee_id == assignee_id and conversation.assigned_to_business == assigned_to_business:
        return conversation

    conversation.assigned_to_id = assignee_id
    conversation.assigned_to_business = assigned_to_business
    db.add(
        ConversationAssignmentHistory(
            conversation_id=conversation.id,
            business_id=business_id,
            actor_id=current_user.id,
            from_assignee_id=from_assignee_id,
            to_assignee_id=assignee_id,
            action=_assignment_action(from_assignee_id, assignee_id, assigned_to_business),
        )
    )
    await db.flush()

    refreshed = await db.execute(_conversation_query().where(Conversation.id == conversation.id))
    return refreshed.unique().scalar_one()
