import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_business, get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.i18n import t
from app.models.label import Label
from app.models.user import User
from app.schemas.label import LabelCreate, LabelOut, LabelUpdate

router = APIRouter(prefix="/api/labels", tags=["labels"])


@router.get("", response_model=list[LabelOut])
async def list_labels(
    search: str | None = Query(default=None, max_length=80),
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    conditions = [Label.business_id == business_id]

    search_text = search.strip() if search else ""
    if search_text:
        conditions.append(Label.name.ilike(f"%{search_text}%"))

    result = await db.execute(select(Label).where(*conditions).order_by(Label.name.asc()))
    return result.scalars().all()


@router.post("", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
async def create_label(
    data: LabelCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    label = Label(
        business_id=current_user.id,
        name=data.name.strip(),
        color=data.color,
        internal_note=data.internal_note,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    if not label.name:
        raise HTTPException(status_code=422, detail="Label name is required")

    db.add(label)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Label name already exists")

    await db.refresh(label)
    return label


@router.put("/{label_id}", response_model=LabelOut)
async def update_label(
    label_id: uuid.UUID,
    data: LabelUpdate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Label).where(Label.id == label_id, Label.business_id == current_user.id)
    )
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Label name is required")
        label.name = name
    if data.color is not None:
        label.color = data.color
    if "internal_note" in data.model_fields_set:
        label.internal_note = data.internal_note
    label.updated_by_id = current_user.id

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Label name already exists")

    await db.refresh(label)
    return label


@router.delete("/{label_id}")
async def delete_label(
    label_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Label).where(Label.id == label_id, Label.business_id == current_user.id)
    )
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    await db.delete(label)
    return {"detail": t("Label deleted")}
