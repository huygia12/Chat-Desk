"""
Admin-only endpoints for system management
"""
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.api.deps import require_admin
from app.database import get_db
from app.models.user import User
from app.models.channel import Channel
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from pydantic import BaseModel
from datetime import datetime
import uuid


router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============= Schemas =============
class BusinessStats(BaseModel):
    id: uuid.UUID
    email: str
    business_name: str | None
    created_at: datetime
    is_active: bool
    channel_count: int
    conversation_count: int
    product_count: int


class SystemStatistics(BaseModel):
    total_businesses: int
    total_channels: int
    total_conversations: int
    total_messages: int
    total_products: int
    active_businesses: int


# ============= Endpoints =============
@router.get("/businesses", response_model=List[BusinessStats])
async def list_businesses(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get list of all business users with their statistics
    Admin-only endpoint
    """
    # Get all business users
    result = await db.execute(
        select(User).where(User.role == "business").order_by(User.created_at.desc())
    )
    businesses = result.scalars().all()
    
    business_stats = []
    for business in businesses:
        # Count channels
        channel_result = await db.execute(
            select(func.count(Channel.id)).where(Channel.business_id == business.id)
        )
        channel_count = channel_result.scalar() or 0
        
        # Count conversations
        conv_result = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.business_id == business.id)
        )
        conversation_count = conv_result.scalar() or 0
        
        # Count products
        prod_result = await db.execute(
            select(func.count(Product.id)).where(Product.business_id == business.id)
        )
        product_count = prod_result.scalar() or 0
        
        # Determine if active (has at least one active channel)
        active_channel_result = await db.execute(
            select(func.count(Channel.id)).where(
                Channel.business_id == business.id,
                Channel.is_active == True
            )
        )
        is_active = (active_channel_result.scalar() or 0) > 0
        
        business_stats.append(
            BusinessStats(
                id=business.id,
                email=business.email,
                business_name=business.business_name,
                created_at=business.created_at,
                is_active=is_active,
                channel_count=channel_count,
                conversation_count=conversation_count,
                product_count=product_count,
            )
        )
    
    return business_stats


@router.get("/statistics", response_model=SystemStatistics)
async def get_system_statistics(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get overall system statistics
    Admin-only endpoint
    """
    # Total businesses
    business_result = await db.execute(
        select(func.count(User.id)).where(User.role == "business")
    )
    total_businesses = business_result.scalar() or 0
    
    # Total channels
    channel_result = await db.execute(select(func.count(Channel.id)))
    total_channels = channel_result.scalar() or 0
    
    # Total conversations
    conv_result = await db.execute(select(func.count(Conversation.id)))
    total_conversations = conv_result.scalar() or 0
    
    # Total messages
    msg_result = await db.execute(select(func.count(Message.id)))
    total_messages = msg_result.scalar() or 0
    
    # Total products
    prod_result = await db.execute(select(func.count(Product.id)))
    total_products = prod_result.scalar() or 0
    
    # Active businesses (have at least one active channel)
    active_business_result = await db.execute(
        select(func.count(func.distinct(Channel.business_id))).where(
            Channel.is_active == True
        )
    )
    active_businesses = active_business_result.scalar() or 0
    
    return SystemStatistics(
        total_businesses=total_businesses,
        total_channels=total_channels,
        total_conversations=total_conversations,
        total_messages=total_messages,
        total_products=total_products,
        active_businesses=active_businesses,
    )
