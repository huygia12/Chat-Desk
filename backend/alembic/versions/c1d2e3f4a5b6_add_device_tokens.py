"""add device tokens

Revision ID: c1d2e3f4a5b6
Revises: f2a3b4c5d6e7
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("expo_push_token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=True),
        sa.Column("device_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expo_push_token", name="uq_device_tokens_expo_push_token"),
    )
    op.create_index(op.f("ix_device_tokens_business_id"), "device_tokens", ["business_id"], unique=False)
    op.create_index(op.f("ix_device_tokens_user_id"), "device_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_device_tokens_user_id"), table_name="device_tokens")
    op.drop_index(op.f("ix_device_tokens_business_id"), table_name="device_tokens")
    op.drop_table("device_tokens")
