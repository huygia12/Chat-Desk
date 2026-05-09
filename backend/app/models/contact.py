import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    platform: Mapped[str] = mapped_column(SAEnum("facebook", "instagram", "telegram", name="platform_type", create_type=False), nullable=False)
    platform_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_pic_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    business = relationship("User", back_populates="contacts")
    conversations = relationship("Conversation", back_populates="contact", cascade="all, delete-orphan")
