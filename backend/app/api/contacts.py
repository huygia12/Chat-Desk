import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.models.label import Label
from app.schemas.contact import ContactOut
from app.schemas.label import ContactLabelAssign
from app.api.deps import get_current_business_or_employee, get_effective_business_id

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.labels))
        .where(Contact.business_id == business_id)
        .order_by(Contact.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.labels))
        .where(Contact.id == contact_id, Contact.business_id == business_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.post("/{contact_id}/labels", response_model=ContactOut)
async def assign_label_to_contact(
    contact_id: uuid.UUID,
    data: ContactLabelAssign,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)

    contact_result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.labels))
        .where(Contact.id == contact_id, Contact.business_id == business_id)
    )
    contact = contact_result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    label_result = await db.execute(
        select(Label).where(Label.id == data.label_id, Label.business_id == business_id)
    )
    label = label_result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    if not any(existing.id == label.id for existing in contact.labels):
        contact.labels.append(label)
        await db.flush()

    return contact


@router.delete("/{contact_id}/labels/{label_id}", response_model=ContactOut)
async def remove_label_from_contact(
    contact_id: uuid.UUID,
    label_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)

    contact_result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.labels))
        .where(Contact.id == contact_id, Contact.business_id == business_id)
    )
    contact = contact_result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    label = next((item for item in contact.labels if item.id == label_id), None)
    if label:
        contact.labels.remove(label)
        await db.flush()

    return contact
