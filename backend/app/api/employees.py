import uuid
from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.user import EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.api.deps import get_current_business

router = APIRouter(prefix="/api/employees", tags=["employees"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
