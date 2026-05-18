"""
Admin-only endpoints for system management.
"""
from datetime import date, datetime, time, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models.channel import Channel
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


class MetricPoint(BaseModel):
    key: str
    label: str
    count: int


class TimeSeriesPoint(BaseModel):
    date: str
    conversations: int
    messages: int
    ai_messages: int


class AdminSummary(BaseModel):
    total_businesses: int
    active_businesses: int
    total_channels: int
    active_channels: int
    total_conversations: int
    total_messages: int
    total_ai_messages: int
    total_products: int
    total_contacts: int
    total_employees: int


class AdminBusinessMetric(BaseModel):
    id: uuid.UUID
    email: str
    business_name: str | None
    created_at: datetime
    account_active: bool
    is_active: bool
    channel_count: int
    active_channel_count: int
    employee_count: int
    contact_count: int
    conversation_count: int
    open_conversation_count: int
    message_count: int
    ai_message_count: int
    product_count: int
    unassigned_count: int
    last_conversation_at: datetime | None = None


class AdminAnalyticsOut(BaseModel):
    days: int
    summary: AdminSummary
    volume: list[TimeSeriesPoint]
    platforms: list[MetricPoint]
    sender_types: list[MetricPoint]
    top_businesses_by_conversations: list[AdminBusinessMetric]
    top_businesses_by_ai: list[AdminBusinessMetric]


class AdminBusinessDirectoryOut(BaseModel):
    items: list[AdminBusinessMetric]


class AdminChannelOut(BaseModel):
    id: uuid.UUID
    platform: str
    name: str
    is_active: bool
    conversation_count: int
    created_at: datetime


class AdminEmployeeOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    is_active: bool
    assigned_conversation_count: int
    created_at: datetime


class AdminRecentConversationOut(BaseModel):
    id: uuid.UUID
    platform: str
    contact_name: str | None
    status: str
    assigned_to_name: str | None = None
    assigned_to_business: bool
    is_ai_enabled: bool
    message_count: int
    last_message_at: datetime | None = None
    created_at: datetime


class AdminBusinessDetailOut(BaseModel):
    business: AdminBusinessMetric
    summary: AdminSummary
    platforms: list[MetricPoint]
    assignments: list[MetricPoint]
    channels: list[AdminChannelOut]
    employees: list[AdminEmployeeOut]
    product_status: list[MetricPoint]
    recent_conversations: list[AdminRecentConversationOut]


class SystemStatistics(BaseModel):
    total_businesses: int
    total_channels: int
    total_conversations: int
    total_messages: int
    total_products: int
    active_businesses: int


def _start_datetime(days: int) -> datetime:
    start_day = date.today() - timedelta(days=days - 1)
    return datetime.combine(start_day, time.min, tzinfo=timezone.utc)


def _date_key(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


async def _count(db: AsyncSession, query) -> int:
    result = await db.execute(query)
    return result.scalar_one() or 0


async def _count_by_key(db: AsyncSession, query) -> dict:
    result = await db.execute(query)
    return {key: value for key, value in result.all()}


def _display_name(user: User) -> str:
    return user.full_name or user.business_name or user.email


async def _business_metrics(
    db: AsyncSession,
    businesses: list[User],
) -> list[AdminBusinessMetric]:
    if not businesses:
        return []

    business_ids = [business.id for business in businesses]

    channel_counts = await _count_by_key(
        db,
        select(Channel.business_id, func.count(Channel.id))
        .where(Channel.business_id.in_(business_ids))
        .group_by(Channel.business_id),
    )
    active_channel_counts = await _count_by_key(
        db,
        select(Channel.business_id, func.count(Channel.id))
        .where(Channel.business_id.in_(business_ids), Channel.is_active == True)
        .group_by(Channel.business_id),
    )
    employee_counts = await _count_by_key(
        db,
        select(User.business_id, func.count(User.id))
        .where(User.business_id.in_(business_ids), User.role == "employee")
        .group_by(User.business_id),
    )
    contact_counts = await _count_by_key(
        db,
        select(Contact.business_id, func.count(Contact.id))
        .where(Contact.business_id.in_(business_ids))
        .group_by(Contact.business_id),
    )
    product_counts = await _count_by_key(
        db,
        select(Product.business_id, func.count(Product.id))
        .where(Product.business_id.in_(business_ids))
        .group_by(Product.business_id),
    )

    conversation_rows = await db.execute(
        select(
            Conversation.business_id,
            func.count(Conversation.id),
            func.sum(cast(Conversation.status == "open", Integer)),
            func.sum(cast(Conversation.assigned_to_id.is_(None) & (Conversation.assigned_to_business == False), Integer)),
            func.max(Conversation.last_message_at),
        )
        .where(Conversation.business_id.in_(business_ids))
        .group_by(Conversation.business_id)
    )
    conversation_counts = {}
    open_counts = {}
    unassigned_counts = {}
    last_conversation_at = {}
    for business_id, total, open_count, unassigned_count, last_at in conversation_rows.all():
        conversation_counts[business_id] = total or 0
        open_counts[business_id] = open_count or 0
        unassigned_counts[business_id] = unassigned_count or 0
        last_conversation_at[business_id] = last_at

    message_rows = await db.execute(
        select(
            Conversation.business_id,
            func.count(Message.id),
            func.sum(cast(Message.sender_type == "ai", Integer)),
        )
        .join(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.business_id.in_(business_ids))
        .group_by(Conversation.business_id)
    )
    message_counts = {}
    ai_message_counts = {}
    for business_id, total, ai_total in message_rows.all():
        message_counts[business_id] = total or 0
        ai_message_counts[business_id] = ai_total or 0

    return [
        AdminBusinessMetric(
            id=business.id,
            email=business.email,
            business_name=business.business_name,
            created_at=business.created_at,
            account_active=business.is_active,
            is_active=(active_channel_counts.get(business.id, 0) > 0),
            channel_count=channel_counts.get(business.id, 0),
            active_channel_count=active_channel_counts.get(business.id, 0),
            employee_count=employee_counts.get(business.id, 0),
            contact_count=contact_counts.get(business.id, 0),
            conversation_count=conversation_counts.get(business.id, 0),
            open_conversation_count=open_counts.get(business.id, 0),
            message_count=message_counts.get(business.id, 0),
            ai_message_count=ai_message_counts.get(business.id, 0),
            product_count=product_counts.get(business.id, 0),
            unassigned_count=unassigned_counts.get(business.id, 0),
            last_conversation_at=last_conversation_at.get(business.id),
        )
        for business in businesses
    ]


async def _all_business_metrics(db: AsyncSession) -> list[AdminBusinessMetric]:
    result = await db.execute(
        select(User).where(User.role == "business").order_by(User.created_at.desc())
    )
    return await _business_metrics(db, result.scalars().all())


async def _admin_summary(db: AsyncSession, business_id=None) -> AdminSummary:
    business_filter = [Conversation.business_id == business_id] if business_id else []
    channel_filter = [Channel.business_id == business_id] if business_id else []
    product_filter = [Product.business_id == business_id] if business_id else []
    contact_filter = [Contact.business_id == business_id] if business_id else []
    employee_filter = [User.business_id == business_id] if business_id else []

    return AdminSummary(
        total_businesses=await _count(db, select(func.count(User.id)).where(User.role == "business")) if not business_id else 1,
        active_businesses=await _count(
            db,
            select(func.count(func.distinct(Channel.business_id))).where(Channel.is_active == True, *channel_filter),
        ),
        total_channels=await _count(db, select(func.count(Channel.id)).where(*channel_filter)),
        active_channels=await _count(db, select(func.count(Channel.id)).where(Channel.is_active == True, *channel_filter)),
        total_conversations=await _count(db, select(func.count(Conversation.id)).where(*business_filter)),
        total_messages=await _count(
            db,
            select(func.count(Message.id)).join(Conversation, Conversation.id == Message.conversation_id).where(*business_filter),
        ),
        total_ai_messages=await _count(
            db,
            select(func.count(Message.id))
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Message.sender_type == "ai", *business_filter),
        ),
        total_products=await _count(db, select(func.count(Product.id)).where(*product_filter)),
        total_contacts=await _count(db, select(func.count(Contact.id)).where(*contact_filter)),
        total_employees=await _count(db, select(func.count(User.id)).where(User.role == "employee", *employee_filter)),
    )


@router.get("/analytics", response_model=AdminAnalyticsOut)
async def get_admin_analytics(
    days: int = Query(14, ge=7, le=90),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    start_at = _start_datetime(days)
    day_keys = [
        (date.today() - timedelta(days=offset)).isoformat()
        for offset in range(days - 1, -1, -1)
    ]

    conversation_daily = await db.execute(
        select(func.date(Conversation.created_at), func.count(Conversation.id))
        .where(Conversation.created_at >= start_at)
        .group_by(func.date(Conversation.created_at))
    )
    conversation_by_day = {_date_key(day): count for day, count in conversation_daily.all()}

    message_daily = await db.execute(
        select(
            func.date(Message.created_at),
            func.count(Message.id),
            func.sum(cast(Message.sender_type == "ai", Integer)),
        )
        .where(Message.created_at >= start_at)
        .group_by(func.date(Message.created_at))
    )
    message_by_day = {}
    ai_by_day = {}
    for day, total, ai_total in message_daily.all():
        key = _date_key(day)
        message_by_day[key] = total or 0
        ai_by_day[key] = ai_total or 0

    platforms_result = await db.execute(
        select(Conversation.platform, func.count(Conversation.id))
        .group_by(Conversation.platform)
        .order_by(func.count(Conversation.id).desc())
    )
    platforms = [
        MetricPoint(key=platform, label=platform.title(), count=count)
        for platform, count in platforms_result.all()
    ]

    sender_result = await db.execute(
        select(Message.sender_type, func.count(Message.id))
        .group_by(Message.sender_type)
        .order_by(func.count(Message.id).desc())
    )
    sender_types = [
        MetricPoint(key=sender_type, label=sender_type.title(), count=count)
        for sender_type, count in sender_result.all()
    ]

    business_metrics = await _all_business_metrics(db)

    return AdminAnalyticsOut(
        days=days,
        summary=await _admin_summary(db),
        volume=[
            TimeSeriesPoint(
                date=day_key,
                conversations=conversation_by_day.get(day_key, 0),
                messages=message_by_day.get(day_key, 0),
                ai_messages=ai_by_day.get(day_key, 0),
            )
            for day_key in day_keys
        ],
        platforms=platforms,
        sender_types=sender_types,
        top_businesses_by_conversations=sorted(
            business_metrics,
            key=lambda item: item.conversation_count,
            reverse=True,
        )[:8],
        top_businesses_by_ai=sorted(
            business_metrics,
            key=lambda item: item.ai_message_count,
            reverse=True,
        )[:8],
    )


@router.get("/businesses", response_model=AdminBusinessDirectoryOut)
async def list_businesses(
    search: str | None = None,
    status: str = Query("all", pattern="^(all|active|inactive)$"),
    sort: str = Query("created_desc"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.role == "business")
    if search:
        needle = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(User.email).like(needle),
                func.lower(func.coalesce(User.business_name, "")).like(needle),
            )
        )

    result = await db.execute(query.order_by(User.created_at.desc()))
    metrics = await _business_metrics(db, result.scalars().all())

    if status == "active":
        metrics = [item for item in metrics if item.is_active]
    elif status == "inactive":
        metrics = [item for item in metrics if not item.is_active]

    sorters = {
        "created_desc": lambda item: item.created_at,
        "conversation_desc": lambda item: item.conversation_count,
        "message_desc": lambda item: item.message_count,
        "ai_desc": lambda item: item.ai_message_count,
        "channel_desc": lambda item: item.channel_count,
        "product_desc": lambda item: item.product_count,
    }
    reverse = sort != "created_asc"
    key_fn = sorters.get(sort, sorters["created_desc"])
    if sort == "created_asc":
        key_fn = lambda item: item.created_at
    metrics = sorted(metrics, key=key_fn, reverse=reverse)

    return AdminBusinessDirectoryOut(items=metrics)


@router.get("/businesses/{business_id}", response_model=AdminBusinessDetailOut)
async def get_business_detail(
    business_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    business_result = await db.execute(
        select(User).where(User.id == business_id, User.role == "business")
    )
    business = business_result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    business_metric = (await _business_metrics(db, [business]))[0]

    platforms_result = await db.execute(
        select(Conversation.platform, func.count(Conversation.id))
        .where(Conversation.business_id == business_id)
        .group_by(Conversation.platform)
        .order_by(func.count(Conversation.id).desc())
    )
    platforms = [
        MetricPoint(key=platform, label=platform.title(), count=count)
        for platform, count in platforms_result.all()
    ]

    assignment_counts = [
        MetricPoint(key="unassigned", label="Unassigned", count=business_metric.unassigned_count),
        MetricPoint(
            key="business",
            label="Business/Shop",
            count=await _count(
                db,
                select(func.count(Conversation.id)).where(
                    Conversation.business_id == business_id,
                    Conversation.assigned_to_id.is_(None),
                    Conversation.assigned_to_business == True,
                ),
            ),
        ),
    ]
    assigned_employee_result = await db.execute(
        select(User.id, User.full_name, User.email, func.count(Conversation.id))
        .join(Conversation, Conversation.assigned_to_id == User.id)
        .where(Conversation.business_id == business_id)
        .group_by(User.id, User.full_name, User.email)
        .order_by(func.count(Conversation.id).desc())
    )
    assignment_counts.extend(
        MetricPoint(key=str(employee_id), label=full_name or email, count=count)
        for employee_id, full_name, email, count in assigned_employee_result.all()
    )

    channel_conversation_counts = await _count_by_key(
        db,
        select(Conversation.channel_id, func.count(Conversation.id))
        .where(Conversation.business_id == business_id)
        .group_by(Conversation.channel_id),
    )
    channels_result = await db.execute(
        select(Channel)
        .where(Channel.business_id == business_id)
        .order_by(Channel.created_at.desc())
    )
    channels = [
        AdminChannelOut(
            id=channel.id,
            platform=channel.platform,
            name=channel.page_name or channel.widget_id or channel.platform,
            is_active=channel.is_active,
            conversation_count=channel_conversation_counts.get(channel.id, 0),
            created_at=channel.created_at,
        )
        for channel in channels_result.scalars().all()
    ]

    employee_assigned_counts = await _count_by_key(
        db,
        select(Conversation.assigned_to_id, func.count(Conversation.id))
        .where(Conversation.business_id == business_id, Conversation.assigned_to_id.is_not(None))
        .group_by(Conversation.assigned_to_id),
    )
    employees_result = await db.execute(
        select(User)
        .where(User.business_id == business_id, User.role == "employee")
        .order_by(User.is_active.desc(), User.full_name.asc().nullslast(), User.email.asc())
    )
    employees = [
        AdminEmployeeOut(
            id=employee.id,
            email=employee.email,
            full_name=employee.full_name,
            is_active=employee.is_active,
            assigned_conversation_count=employee_assigned_counts.get(employee.id, 0),
            created_at=employee.created_at,
        )
        for employee in employees_result.scalars().all()
    ]

    product_status_result = await db.execute(
        select(Product.status, func.count(Product.id))
        .where(Product.business_id == business_id)
        .group_by(Product.status)
        .order_by(func.count(Product.id).desc())
    )
    product_status = [
        MetricPoint(key=status, label=status.replace("_", " ").title(), count=count)
        for status, count in product_status_result.all()
    ]

    message_counts = await _count_by_key(
        db,
        select(Message.conversation_id, func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.business_id == business_id)
        .group_by(Message.conversation_id),
    )
    recent_result = await db.execute(
        select(Conversation, Contact, User)
        .join(Contact, Contact.id == Conversation.contact_id)
        .outerjoin(User, User.id == Conversation.assigned_to_id)
        .where(Conversation.business_id == business_id)
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
        .limit(12)
    )
    recent_conversations = [
        AdminRecentConversationOut(
            id=conversation.id,
            platform=conversation.platform,
            contact_name=contact.display_name or contact.platform_user_id,
            status=conversation.status,
            assigned_to_name=_display_name(assignee) if assignee else None,
            assigned_to_business=conversation.assigned_to_business,
            is_ai_enabled=conversation.is_ai_enabled,
            message_count=message_counts.get(conversation.id, 0),
            last_message_at=conversation.last_message_at,
            created_at=conversation.created_at,
        )
        for conversation, contact, assignee in recent_result.all()
    ]

    return AdminBusinessDetailOut(
        business=business_metric,
        summary=await _admin_summary(db, business_id),
        platforms=platforms,
        assignments=assignment_counts,
        channels=channels,
        employees=employees,
        product_status=product_status,
        recent_conversations=recent_conversations,
    )


@router.get("/statistics", response_model=SystemStatistics)
async def get_system_statistics(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    summary = await _admin_summary(db)
    return SystemStatistics(
        total_businesses=summary.total_businesses,
        total_channels=summary.total_channels,
        total_conversations=summary.total_conversations,
        total_messages=summary.total_messages,
        total_products=summary.total_products,
        active_businesses=summary.active_businesses,
    )
