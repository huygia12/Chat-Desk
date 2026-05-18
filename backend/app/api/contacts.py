import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.conversation_assignment import ConversationLabelHistory
from app.models.label import Label
from app.schemas.contact import ContactOut
from app.schemas.label import ContactLabelAssign
from app.api.deps import get_current_business_or_employee, get_effective_business_id
from app.services.assignment_service import auto_assign_conversation

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


async def _verify_label_conversation_access(
    conversation_id: uuid.UUID | None,
    contact_id: uuid.UUID,
    business_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> uuid.UUID | None:
    if current_user.role == "employee" and conversation_id is None:
        raise HTTPException(status_code=403, detail="Conversation is required")
    if conversation_id is None:
        return None

    filters = [
        Conversation.id == conversation_id,
        Conversation.contact_id == contact_id,
        Conversation.business_id == business_id,
    ]
    if current_user.role == "employee":
        filters.append(Conversation.assigned_to_id == current_user.id)

    result = await db.execute(select(Conversation.id).where(*filters))
    verified_id = result.scalar_one_or_none()
    if verified_id is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return verified_id


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

    verified_conversation_id = await _verify_label_conversation_access(
        data.conversation_id,
        contact.id,
        business_id,
        current_user,
        db,
    )

    if not any(existing.id == label.id for existing in contact.labels):
        contact.labels.append(label)
        db.add(
            ConversationLabelHistory(
                conversation_id=verified_conversation_id,
                contact_id=contact.id,
                business_id=business_id,
                actor_id=current_user.id,
                label_id=label.id,
                action="added",
            )
        )
        await db.flush()
        if verified_conversation_id is not None:
            conversation_result = await db.execute(
                select(Conversation).where(
                    Conversation.id == verified_conversation_id,
                    Conversation.business_id == business_id,
                )
            )
            conversation = conversation_result.scalar_one_or_none()
            if conversation:
                await auto_assign_conversation(
                    db=db,
                    conversation=conversation,
                    business_id=business_id,
                    platform=conversation.platform,
                    contact_id=contact.id,
                    label_id=label.id,
                )

    return contact


@router.delete("/{contact_id}/labels/{label_id}", response_model=ContactOut)
async def remove_label_from_contact(
    contact_id: uuid.UUID,
    label_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
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

    verified_conversation_id = await _verify_label_conversation_access(
        conversation_id,
        contact.id,
        business_id,
        current_user,
        db,
    )

    label = next((item for item in contact.labels if item.id == label_id), None)
    if label:
        contact.labels.remove(label)
        db.add(
            ConversationLabelHistory(
                conversation_id=verified_conversation_id,
                contact_id=contact.id,
                business_id=business_id,
                actor_id=current_user.id,
                label_id=label.id,
                action="removed",
            )
        )
        await db.flush()

    return contact
