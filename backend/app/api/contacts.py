import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.schemas.contact import ContactOut
from app.api.deps import get_current_business

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(Contact.business_id == current_user.id).order_by(Contact.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.business_id == current_user.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact
