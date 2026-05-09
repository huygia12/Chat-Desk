from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/profile", response_model=UserOut)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/profile", response_model=UserOut)
async def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.business_name is not None:
        current_user.business_name = data.business_name
    if data.business_description is not None:
        current_user.business_description = data.business_description
    if data.phone is not None:
        current_user.phone = data.phone

    await db.flush()
    await db.refresh(current_user)
    return current_user
