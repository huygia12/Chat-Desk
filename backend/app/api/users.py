from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate
from app.api.deps import get_current_user
from app.services.file_storage import delete_public_file_url, save_upload_file

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
    update_fields = data.model_fields_set
    if "business_name" in update_fields:
        current_user.business_name = data.business_name
    if "business_description" in update_fields:
        current_user.business_description = data.business_description
    if "store_address" in update_fields:
        current_user.store_address = data.store_address
    if "opening_hours" in update_fields:
        current_user.opening_hours = data.opening_hours
    if "shipping_policy" in update_fields:
        current_user.shipping_policy = data.shipping_policy
    if "warranty_policy" in update_fields:
        current_user.warranty_policy = data.warranty_policy
    if "payment_methods" in update_fields:
        current_user.payment_methods = data.payment_methods
    if "hotline" in update_fields:
        current_user.hotline = data.hotline
    if "phone" in update_fields:
        current_user.phone = data.phone

    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.post("/profile/avatar", response_model=UserOut)
async def update_business_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "business":
        raise HTTPException(status_code=403, detail="Only business users can update avatar")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an image")

    old_avatar_url = current_user.avatar_url
    saved_file = await save_upload_file(file)
    if saved_file["attachment_kind"] != "image":
        delete_public_file_url(saved_file["attachment_url"])
        raise HTTPException(status_code=400, detail="Avatar must be an image")

    current_user.avatar_url = saved_file["attachment_url"]
    await db.commit()
    await db.refresh(current_user)

    if old_avatar_url and old_avatar_url != current_user.avatar_url:
        delete_public_file_url(old_avatar_url)

    return current_user
