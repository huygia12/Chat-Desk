from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import get_current_business
from app.database import get_db
from app.models.channel import Channel
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.label import Label, contact_labels
from app.models.message import Message
from app.models.user import User
from app.schemas.statistics import (
    AssignmentStatistic,
    BusinessStatisticSummary,
    BusinessStatisticsOut,
    ChannelStatistic,
    LabelStatistic,
    MetricPoint,
    TimeSeriesPoint,
)

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _start_datetime(days: int) -> datetime:
    start_day = date.today() - timedelta(days=days - 1)
    return datetime.combine(start_day, time.min, tzinfo=timezone.utc)


def _date_key(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


@router.get("/business", response_model=BusinessStatisticsOut)
async def get_business_statistics(
    days: int = Query(14, ge=7, le=90),
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    business_id = current_user.id
    start_at = _start_datetime(days)
    day_keys = [
        (date.today() - timedelta(days=offset)).isoformat()
        for offset in range(days - 1, -1, -1)
    ]

    total_conversations = await _count(
        db,
        select(func.count()).select_from(Conversation).where(Conversation.business_id == business_id),
    )
    open_conversations = await _count(
        db,
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.status == "open",
        ),
    )
    closed_conversations = await _count(
        db,
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.status == "closed",
        ),
    )
    total_contacts = await _count(
        db,
        select(func.count()).select_from(Contact).where(Contact.business_id == business_id),
    )
    total_messages = await _count(
        db,
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.business_id == business_id),
    )
    ai_messages = await _count(
        db,
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.business_id == business_id, Message.sender_type == "ai"),
    )
    unassigned_conversations = await _count(
        db,
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_(None),
            Conversation.assigned_to_business == False,
        ),
    )

    conversation_daily = await db.execute(
        select(func.date(Conversation.created_at), func.count(Conversation.id))
        .where(Conversation.business_id == business_id, Conversation.created_at >= start_at)
        .group_by(func.date(Conversation.created_at))
    )
    conversation_by_day = {_date_key(day): count for day, count in conversation_daily.all()}

    message_daily = await db.execute(
        select(func.date(Message.created_at), func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.business_id == business_id, Message.created_at >= start_at)
        .group_by(func.date(Message.created_at))
    )
    message_by_day = {_date_key(day): count for day, count in message_daily.all()}

    volume = [
        TimeSeriesPoint(
            date=day_key,
            conversations=conversation_by_day.get(day_key, 0),
            messages=message_by_day.get(day_key, 0),
        )
        for day_key in day_keys
    ]

    platforms = await _metric_points(
        db,
        select(Conversation.platform, func.count(Conversation.id))
        .where(Conversation.business_id == business_id)
        .group_by(Conversation.platform)
        .order_by(func.count(Conversation.id).desc()),
    )

    channel_rows = await db.execute(
        select(
            Channel.id,
            Channel.page_name,
            Channel.widget_id,
            Channel.platform,
            func.count(Conversation.id),
        )
        .outerjoin(Conversation, Conversation.channel_id == Channel.id)
        .where(Channel.business_id == business_id)
        .group_by(Channel.id, Channel.page_name, Channel.widget_id, Channel.platform)
        .order_by(func.count(Conversation.id).desc())
        .limit(8)
    )
    channels = [
        ChannelStatistic(
            id=str(channel_id),
            name=page_name or widget_id or platform,
            platform=platform,
            count=count,
        )
        for channel_id, page_name, widget_id, platform, count in channel_rows.all()
    ]

    assignments = await _assignment_statistics(db, business_id)

    sender_types = await _metric_points(
        db,
        select(Message.sender_type, func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.business_id == business_id)
        .group_by(Message.sender_type)
        .order_by(func.count(Message.id).desc()),
    )

    label_rows = await db.execute(
        select(Label.id, Label.name, Label.color, func.count(contact_labels.c.contact_id))
        .join(contact_labels, contact_labels.c.label_id == Label.id)
        .where(Label.business_id == business_id)
        .group_by(Label.id, Label.name, Label.color)
        .order_by(func.count(contact_labels.c.contact_id).desc())
        .limit(8)
    )
    top_labels = [
        LabelStatistic(id=str(label_id), name=name, color=color, count=count)
        for label_id, name, color, count in label_rows.all()
    ]

    return BusinessStatisticsOut(
        days=days,
        summary=BusinessStatisticSummary(
            total_conversations=total_conversations,
            open_conversations=open_conversations,
            closed_conversations=closed_conversations,
            total_contacts=total_contacts,
            total_messages=total_messages,
            ai_messages=ai_messages,
            unassigned_conversations=unassigned_conversations,
            avg_first_response_minutes=await _average_first_response_minutes(db, business_id, start_at),
        ),
        volume=volume,
        platforms=platforms,
        channels=channels,
        assignments=assignments,
        sender_types=sender_types,
        top_labels=top_labels,
    )


async def _count(db: AsyncSession, query) -> int:
    result = await db.execute(query)
    return result.scalar_one() or 0


async def _metric_points(db: AsyncSession, query) -> list[MetricPoint]:
    result = await db.execute(query)
    return [
        MetricPoint(key=str(key), label=str(key).replace("_", " ").title(), count=count)
        for key, count in result.all()
    ]


async def _assignment_statistics(
    db: AsyncSession,
    business_id,
) -> list[AssignmentStatistic]:
    employee_counts_result = await db.execute(
        select(Conversation.assigned_to_id, func.count(Conversation.id))
        .where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_not(None),
        )
        .group_by(Conversation.assigned_to_id)
    )
    employee_counts = {employee_id: count for employee_id, count in employee_counts_result.all()}

    business_count = await _count(
        db,
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_(None),
            Conversation.assigned_to_business == True,
        ),
    )
    unassigned_count = await _count(
        db,
        select(func.count()).select_from(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.assigned_to_id.is_(None),
            Conversation.assigned_to_business == False,
        ),
    )

    employees_result = await db.execute(
        select(User)
        .where(User.business_id == business_id, User.role == "employee")
        .order_by(User.is_active.desc(), User.full_name.asc().nullslast(), User.email.asc())
    )
    rows = [
        AssignmentStatistic(key="unassigned", name="Unassigned", type="unassigned", count=unassigned_count),
        AssignmentStatistic(key="business", name="Business/Shop", type="business", count=business_count),
    ]
    rows.extend(
        AssignmentStatistic(
            key=str(employee.id),
            name=employee.full_name or employee.email,
            type="employee",
            count=employee_counts.get(employee.id, 0),
        )
        for employee in employees_result.scalars().all()
    )
    return sorted(rows, key=lambda item: item.count, reverse=True)


async def _average_first_response_minutes(
    db: AsyncSession,
    business_id,
    start_at: datetime,
) -> float | None:
    contact_message = aliased(Message)
    reply_message = aliased(Message)

    first_contact = (
        select(
            contact_message.conversation_id.label("conversation_id"),
            func.min(contact_message.created_at).label("first_contact_at"),
        )
        .join(Conversation, Conversation.id == contact_message.conversation_id)
        .where(
            Conversation.business_id == business_id,
            contact_message.sender_type == "contact",
            contact_message.created_at >= start_at,
        )
        .group_by(contact_message.conversation_id)
        .subquery()
    )

    first_reply = (
        select(
            reply_message.conversation_id.label("conversation_id"),
            func.min(reply_message.created_at).label("first_reply_at"),
        )
        .join(first_contact, first_contact.c.conversation_id == reply_message.conversation_id)
        .where(
            reply_message.sender_type.in_(["business", "ai"]),
            reply_message.created_at > first_contact.c.first_contact_at,
        )
        .group_by(reply_message.conversation_id)
        .subquery()
    )

    response_rows = await db.execute(
        select(first_contact.c.first_contact_at, first_reply.c.first_reply_at)
        .join(first_reply, first_reply.c.conversation_id == first_contact.c.conversation_id)
    )
    response_minutes = [
        (reply_at - contact_at).total_seconds() / 60
        for contact_at, reply_at in response_rows.all()
        if reply_at and contact_at and reply_at >= contact_at
    ]
    if not response_minutes:
        return None
    return round(sum(response_minutes) / len(response_minutes), 1)
