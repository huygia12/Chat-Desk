import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.conversation_assignment import ConversationLabelHistory
from app.models.label import Label
from app.services.assignment_service import auto_assign_conversation
from app.utils.logging import pretty_log
from app.websocket.manager import manager

logger = logging.getLogger(__name__)
ORDER_READY_TRIGGER = "order_ready"


def _label_payload(label: Label) -> dict:
    return {
        "id": str(label.id),
        "business_id": str(label.business_id),
        "name": label.name,
        "color": label.color,
        "internal_note": label.internal_note,
        "ai_auto_apply_trigger": label.ai_auto_apply_trigger,
        "created_at": label.created_at.isoformat() if label.created_at else None,
        "updated_at": label.updated_at.isoformat() if label.updated_at else None,
    }


async def get_order_ready_auto_labels(
    db: AsyncSession,
    business_id: uuid.UUID,
) -> list[Label]:
    result = await db.execute(
        select(Label)
        .where(
            Label.business_id == business_id,
            Label.ai_auto_apply_trigger == ORDER_READY_TRIGGER,
        )
        .order_by(Label.name.asc())
    )
    return result.scalars().all()


def _normalize_order_detection(order_detection: dict | None) -> dict:
    order_detection = order_detection if isinstance(order_detection, dict) else {}
    missing_fields = order_detection.get("missing_fields")
    if not isinstance(missing_fields, list):
        missing_fields = []
    detected_fields = order_detection.get("detected_fields")
    if not isinstance(detected_fields, dict):
        detected_fields = {}

    return {
        "is_order_intent": bool(order_detection.get("is_order_intent")),
        "is_order_ready": bool(order_detection.get("is_order_ready")),
        "confidence": order_detection.get("confidence", 0.0),
        "missing_fields": [str(item)[:80] for item in missing_fields],
        "detected_fields": detected_fields,
        "reason": str(order_detection.get("reason") or "").strip()[:500],
    }


async def apply_order_ready_labels_if_needed(
    *,
    db: AsyncSession,
    conversation: Conversation,
    contact_id: uuid.UUID,
    order_detection: dict | None = None,
) -> dict:
    detection = _normalize_order_detection(order_detection)
    if not detection["is_order_ready"]:
        logger.info(
            "Order readiness not confirmed:\n%s",
            pretty_log({
                "conversation_id": conversation.id,
                "confidence": detection["confidence"],
                "missing_fields": detection["missing_fields"],
                "reason": detection["reason"],
            }),
        )
        return {
            "applied": False,
            "should_send_handoff": False,
            "reason": detection["reason"] or "order is not ready",
            "detection": detection,
        }

    labels = await get_order_ready_auto_labels(db, conversation.business_id)
    if not labels:
        return {
            "applied": False,
            "should_send_handoff": False,
            "reason": "no order-ready labels configured",
        }

    contact_result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.labels))
        .where(
            Contact.id == contact_id,
            Contact.business_id == conversation.business_id,
        )
    )
    contact = contact_result.scalar_one_or_none()
    if not contact:
        return {
            "applied": False,
            "should_send_handoff": False,
            "reason": "contact not found",
        }

    existing_label_ids = {label.id for label in contact.labels}
    labels_to_apply = [label for label in labels if label.id not in existing_label_ids]
    if not labels_to_apply:
        return {
            "applied": False,
            "should_send_handoff": False,
            "reason": "order-ready labels already applied",
            "detection": detection,
        }

    for label in labels_to_apply:
        contact.labels.append(label)
        db.add(
            ConversationLabelHistory(
                conversation_id=conversation.id,
                contact_id=contact.id,
                business_id=conversation.business_id,
                actor_id=conversation.business_id,
                label_id=label.id,
                action="added",
            )
        )
        await auto_assign_conversation(
            db=db,
            conversation=conversation,
            business_id=conversation.business_id,
            platform=conversation.platform,
            contact_id=contact.id,
            label_id=label.id,
        )

    await db.flush()
    await db.refresh(contact, attribute_names=["labels"])

    await manager.send_message(
        str(conversation.business_id),
        {
            "type": "contact_labels_updated",
            "conversation_id": str(conversation.id),
            "contact_id": str(contact.id),
            "labels": [_label_payload(label) for label in contact.labels],
        },
    )

    logger.info(
        "Order-ready labels applied:\n%s",
        pretty_log({
            "conversation_id": conversation.id,
            "contact_id": contact.id,
            "labels": [label.name for label in labels_to_apply],
            "confidence": detection["confidence"],
        }),
    )

    return {
        "applied": True,
        "should_send_handoff": True,
        "labels": labels_to_apply,
        "detection": detection,
    }
