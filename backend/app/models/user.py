import uuid
from datetime import datetime
from sqlalchemy import String, Text, Enum as SAEnum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(SAEnum("business", "admin", name="user_role"), nullable=False, default="business")
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    channels = relationship("Channel", back_populates="business", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="business", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="business", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="business", cascade="all, delete-orphan")
