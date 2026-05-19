from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_business, get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.models.conversation import Conversation
from app.models.conversation_assignment import AssignmentSetting
from app.models.user import User
from app.services.assignment_service import get_auto_assignable_employee_ids, get_auto_assignable_employees
from app.schemas.assignment import (
    AssigneeOptionOut,
    AssignmentOverviewBucket,
    AssignmentOverviewOut,
    AssignmentSettingOut,
    AssignmentSettingUpdate,
)

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


async def _get_or_create_setting(business_id, db: AsyncSession) -> AssignmentSetting:
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
    await db.refresh(setting)
    return setting


async def _auto_assignable_employee_ids(business_id, db: AsyncSession) -> set:
    return await get_auto_assignable_employee_ids(db, business_id)


def _clean_rule_map(rules: dict | None, auto_assignable_employee_ids: set) -> dict:
    if not rules:
        return {}

    cleaned = {}
    auto_assignable_ids = {str(item) for item in auto_assignable_employee_ids}
    for key, value in rules.items():
        if value is None:
            continue
        values = value if isinstance(value, list) else [value]
        cleaned_values = []
        for item in values:
            value_text = str(item)
            if value_text in auto_assignable_ids and value_text not in cleaned_values:
                cleaned_values.append(value_text)
        if cleaned_values:
            cleaned[str(key)] = cleaned_values
    return cleaned


@router.get("/settings", response_model=AssignmentSettingOut)
async def get_assignment_settings(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    return await _get_or_create_setting(business_id, db)


@router.patch("/settings", response_model=AssignmentSettingOut)
async def update_assignment_settings(
    data: AssignmentSettingUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    setting = await _get_or_create_setting(current_user.id, db)
    if data.employee_assignment_locked is not None:
        setting.employee_assignment_locked = data.employee_assignment_locked
    if data.auto_assign_enabled is not None:
        setting.auto_assign_enabled = data.auto_assign_enabled
    if data.auto_assign_strategy is not None:
        if data.auto_assign_strategy not in {"round_robin", "least_active"}:
            raise HTTPException(status_code=422, detail="Unsupported assignment strategy")
        setting.auto_assign_strategy = data.auto_assign_strategy

    auto_assignable_ids = None
    if data.channel_assignment_rules is not None:
        auto_assignable_ids = auto_assignable_ids or await _auto_assignable_employee_ids(current_user.id, db)
        setting.channel_assignment_rules = _clean_rule_map(data.channel_assignment_rules, auto_assignable_ids)
    if data.label_assignment_rules is not None:
        auto_assignable_ids = auto_assignable_ids or await _auto_assignable_employee_ids(current_user.id, db)
        setting.label_assignment_rules = _clean_rule_map(data.label_assignment_rules, auto_assignable_ids)

    await db.flush()
    await db.refresh(setting)
    return setting


@router.get("/overview", response_model=AssignmentOverviewOut)
async def get_assignment_overview(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    business_id = current_user.id

    total_result = await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.business_id == business_id)
    )
    unassigned_result = await db.execute(
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_(None),
            Conversation.assigned_to_business == False,
        )
    )
    business_result = await db.execute(
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_(None),
            Conversation.assigned_to_business == True,
        )
    )
    employee_counts_result = await db.execute(
        select(Conversation.assigned_to_id, func.count(Conversation.id))
        .where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_not(None),
        )
        .group_by(Conversation.assigned_to_id)
    )
    employee_counts = {employee_id: count for employee_id, count in employee_counts_result.all()}

    employees_result = await db.execute(
        select(User)
        .where(User.business_id == business_id, User.role == "employee")
        .order_by(User.is_active.desc(), User.full_name.asc().nullslast(), User.email.asc())
    )
    buckets = [
        AssignmentOverviewBucket(
            assignee_id=employee.id,
            assignee_type="employee",
            name=employee.full_name or employee.email,
            email=employee.email,
            count=employee_counts.get(employee.id, 0),
        )
        for employee in employees_result.scalars().all()
    ]

    return AssignmentOverviewOut(
        total_conversations=total_result.scalar_one(),
        unassigned_count=unassigned_result.scalar_one(),
        business_assigned_count=business_result.scalar_one(),
        employee_assigned=buckets,
    )


@router.get("/assignees", response_model=list[AssigneeOptionOut])
async def list_assignees(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)

    business_result = await db.execute(select(User).where(User.id == business_id))
    business = business_result.scalar_one()
    options = [
        AssigneeOptionOut(
            id=None,
            type="business",
            name=business.business_name or business.email,
            email=business.email,
        )
    ]

    for employee in await get_auto_assignable_employees(db, business_id):
        options.append(
            AssigneeOptionOut(
                id=employee.id,
                type="employee",
                name=employee.full_name or employee.email,
                email=employee.email,
            )
        )

    return options
