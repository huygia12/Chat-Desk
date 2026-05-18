import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.conversation_assignment import AssignmentSetting, ConversationAssignmentHistory
from app.models.label import contact_labels
from app.models.user import User


async def get_or_create_assignment_setting(
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


async def auto_assign_conversation(
    db: AsyncSession,
    conversation: Conversation,
    business_id: uuid.UUID,
    platform: str,
    contact_id: uuid.UUID,
    label_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    if conversation.assigned_to_id or conversation.assigned_to_business:
        return conversation.assigned_to_id

    setting = await get_or_create_assignment_setting(business_id, db)
    if not setting.auto_assign_enabled:
        return None

    employees = await _active_employees(db, business_id)
    if not employees:
        return None

    employee_ids = {employee.id for employee in employees}
    target_id = await _rule_target(
        db=db,
        business_id=business_id,
        contact_id=contact_id,
        label_rules=setting.label_assignment_rules or {},
        channel_rules=setting.channel_assignment_rules or {},
        platform=platform,
        employee_ids=employee_ids,
        label_id=label_id,
    )

    if target_id is None:
        if setting.auto_assign_strategy == "least_active":
            target_id = await _least_active_employee_id(db, business_id, employees)
        else:
            target_id = _next_round_robin_employee_id(setting, employees)
            setting.last_round_robin_assignee_id = target_id

    if target_id is None:
        return None

    conversation.assigned_to_id = target_id
    conversation.assigned_to_business = False
    db.add(
        ConversationAssignmentHistory(
            conversation_id=conversation.id,
            business_id=business_id,
            actor_id=business_id,
            from_assignee_id=None,
            to_assignee_id=target_id,
            action="auto_assigned",
        )
    )
    await db.flush()
    return target_id


async def _active_employees(db: AsyncSession, business_id: uuid.UUID) -> list[User]:
    result = await db.execute(
        select(User)
        .where(
            User.business_id == business_id,
            User.role == "employee",
            User.is_active == True,
        )
        .order_by(User.full_name.asc().nullslast(), User.email.asc(), User.id.asc())
    )
    return result.scalars().all()


async def _rule_target(
    db: AsyncSession,
    business_id: uuid.UUID,
    contact_id: uuid.UUID,
    label_rules: dict,
    channel_rules: dict,
    platform: str,
    employee_ids: set[uuid.UUID],
    label_id: uuid.UUID | None,
) -> uuid.UUID | None:
    label_candidates = [str(label_id)] if label_id else []
    if not label_candidates and label_rules:
        result = await db.execute(
            select(contact_labels.c.label_id).where(contact_labels.c.contact_id == contact_id)
        )
        label_candidates = [str(item) for item in result.scalars().all()]

    for candidate in label_candidates:
        target = _active_rule_value(label_rules.get(candidate), employee_ids)
        if target:
            return target

    return _active_rule_value(channel_rules.get(platform), employee_ids)


def _active_rule_value(value, employee_ids: set[uuid.UUID]) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        target_id = uuid.UUID(str(value))
    except ValueError:
        return None
    return target_id if target_id in employee_ids else None


async def _least_active_employee_id(
    db: AsyncSession,
    business_id: uuid.UUID,
    employees: list[User],
) -> uuid.UUID | None:
    employee_ids = [employee.id for employee in employees]
    result = await db.execute(
        select(Conversation.assigned_to_id, func.count(Conversation.id))
        .where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.in_(employee_ids),
        )
        .group_by(Conversation.assigned_to_id)
    )
    counts = {employee_id: count for employee_id, count in result.all()}
    return min(employee_ids, key=lambda employee_id: (counts.get(employee_id, 0), str(employee_id)))


def _next_round_robin_employee_id(
    setting: AssignmentSetting,
    employees: list[User],
) -> uuid.UUID | None:
    employee_ids = [employee.id for employee in employees]
    if not employee_ids:
        return None

    if setting.last_round_robin_assignee_id in employee_ids:
        index = employee_ids.index(setting.last_round_robin_assignee_id)
        return employee_ids[(index + 1) % len(employee_ids)]

    return employee_ids[0]
