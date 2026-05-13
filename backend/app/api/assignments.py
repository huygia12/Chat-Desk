from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_business, get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.models.conversation_assignment import AssignmentSetting
from app.models.user import User
from app.schemas.assignment import AssignmentSettingOut, AssignmentSettingUpdate, AssigneeOptionOut

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


async def _get_or_create_setting(business_id, db: AsyncSession) -> AssignmentSetting:
    result = await db.execute(
        select(AssignmentSetting).where(AssignmentSetting.business_id == business_id)
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting

    setting = AssignmentSetting(business_id=business_id, employee_assignment_locked=False)
    db.add(setting)
    await db.flush()
    await db.refresh(setting)
    return setting


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
    setting.employee_assignment_locked = data.employee_assignment_locked
    await db.flush()
    await db.refresh(setting)
    return setting


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

    employee_result = await db.execute(
        select(User)
        .where(User.business_id == business_id, User.role == "employee", User.is_active == True)
        .order_by(User.full_name.asc().nullslast(), User.email.asc())
    )
    for employee in employee_result.scalars().all():
        options.append(
            AssigneeOptionOut(
                id=employee.id,
                type="employee",
                name=employee.full_name or employee.email,
                email=employee.email,
            )
        )

    return options
