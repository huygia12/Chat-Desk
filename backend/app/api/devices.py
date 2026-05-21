from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.models.device_token import DeviceToken
from app.models.user import User
from app.schemas.device import DeviceRegisterRequest, DeviceRegisterResponse

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.post("/register", response_model=DeviceRegisterResponse)
async def register_device(
    data: DeviceRegisterRequest,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(DeviceToken).where(DeviceToken.expo_push_token == data.expo_push_token)
    )
    device = result.scalar_one_or_none()

    if device is None:
        device = DeviceToken(
            user_id=current_user.id,
            business_id=business_id,
            expo_push_token=data.expo_push_token,
        )
        db.add(device)

    device.user_id = current_user.id
    device.business_id = business_id
    device.platform = data.platform
    device.device_name = data.device_name
    await db.commit()
    return {"status": "ok"}


@router.delete("/{expo_push_token}", response_model=DeviceRegisterResponse)
async def unregister_device(
    expo_push_token: str,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(DeviceToken).where(
            DeviceToken.expo_push_token == expo_push_token,
            DeviceToken.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"status": "deleted"}
