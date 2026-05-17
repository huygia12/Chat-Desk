import uuid
from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.i18n import t
from app.models.user import User
from app.schemas.user import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    EmployeeProfileUpdate,
    EmployeePasswordUpdate,
    EmployeeOwnPasswordUpdate,
)
from app.api.deps import get_current_business, get_current_business_or_employee

router = APIRouter(prefix="/api/employees", tags=["employees"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def _ensure_email_available(
    email: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    result = await db.execute(select(User).where(User.email == email, User.id != user_id))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")


def _validate_password(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")


def _normalize_full_name(full_name: str) -> str:
    normalized = full_name.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="Full name is required")
    return normalized


@router.get("", response_model=list[EmployeeOut])
async def list_employees(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """List all employees belonging to this business."""
    result = await db.execute(
        select(User)
        .where(User.business_id == current_user.id, User.role == "employee")
        .order_by(User.created_at.asc())
    )
    return result.scalars().all()


@router.post("", response_model=EmployeeOut, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Create a new employee account for this business."""
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    employee = User(
        email=data.email,
        password_hash=pwd_context.hash(data.password),
        role="employee",
        full_name=data.full_name,
        business_id=current_user.id,
        is_active=True,
    )
    db.add(employee)
    await db.flush()
    await db.refresh(employee)
    return employee


@router.patch("/me/profile", response_model=EmployeeOut)
async def update_my_employee_profile(
    data: EmployeeProfileUpdate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    """Allow an employee to update their own profile information."""
    if current_user.role != "employee":
        raise HTTPException(status_code=403, detail="Only employees can perform this action")

    await _ensure_email_available(data.email, current_user.id, db)
    current_user.email = data.email
    current_user.full_name = _normalize_full_name(data.full_name)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/password")
async def update_my_employee_password(
    data: EmployeeOwnPasswordUpdate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    """Allow an employee to update their own password."""
    if current_user.role != "employee":
        raise HTTPException(status_code=403, detail="Only employees can perform this action")

    _validate_password(data.password)
    if not pwd_context.verify(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = pwd_context.hash(data.password)
    await db.flush()
    return {"detail": t("Password updated")}


@router.patch("/{employee_id}/profile", response_model=EmployeeOut)
async def update_employee_profile(
    employee_id: uuid.UUID,
    data: EmployeeProfileUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Update profile information for an employee belonging to this business."""
    result = await db.execute(
        select(User).where(
            User.id == employee_id,
            User.business_id == current_user.id,
            User.role == "employee",
        )
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_email_available(data.email, employee.id, db)
    employee.email = data.email
    employee.full_name = _normalize_full_name(data.full_name)
    await db.flush()
    await db.refresh(employee)
    return employee


@router.patch("/{employee_id}/password")
async def update_employee_password(
    employee_id: uuid.UUID,
    data: EmployeePasswordUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Update password for an employee belonging to this business."""
    _validate_password(data.password)
    result = await db.execute(
        select(User).where(
            User.id == employee_id,
            User.business_id == current_user.id,
            User.role == "employee",
        )
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.password_hash = pwd_context.hash(data.password)
    await db.flush()
    return {"detail": t("Password updated")}


@router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee_status(
    employee_id: uuid.UUID,
    data: EmployeeUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Lock or unlock an employee account."""
    result = await db.execute(
        select(User).where(
            User.id == employee_id,
            User.business_id == current_user.id,
            User.role == "employee",
        )
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.is_active = data.is_active
    await db.flush()
    await db.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete an employee account."""
    result = await db.execute(
        select(User).where(
            User.id == employee_id,
            User.business_id == current_user.id,
            User.role == "employee",
        )
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await db.delete(employee)
