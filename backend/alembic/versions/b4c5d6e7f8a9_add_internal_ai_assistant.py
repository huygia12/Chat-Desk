"""add internal ai assistant

Revision ID: b4c5d6e7f8a9
Revises: a2b3c4d5e6f7
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("sku", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("category", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("stock_quantity", sa.Integer(), nullable=True))

    op.add_column("users", sa.Column("store_address", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("opening_hours", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("shipping_policy", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("warranty_policy", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("payment_methods", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("hotline", sa.String(length=50), nullable=True))

    op.create_table(
        "ai_assistant_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_assistant_messages_user_created",
        "ai_assistant_messages",
        ["user_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_assistant_messages_user_created", table_name="ai_assistant_messages")
    op.drop_table("ai_assistant_messages")

    op.drop_column("users", "hotline")
    op.drop_column("users", "payment_methods")
    op.drop_column("users", "warranty_policy")
    op.drop_column("users", "shipping_policy")
    op.drop_column("users", "opening_hours")
    op.drop_column("users", "store_address")

    op.drop_column("products", "stock_quantity")
    op.drop_column("products", "category")
    op.drop_column("products", "sku")
