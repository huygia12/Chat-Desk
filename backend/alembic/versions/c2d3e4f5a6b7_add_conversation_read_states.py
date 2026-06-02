"""add conversation read states

Revision ID: c2d3e4f5a6b7
Revises: c1d2e3f4a5b6
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversation_read_states",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_read_states_conversation_user"),
    )
    op.create_index(op.f("ix_conversation_read_states_business_id"), "conversation_read_states", ["business_id"], unique=False)
    op.create_index(op.f("ix_conversation_read_states_conversation_id"), "conversation_read_states", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_conversation_read_states_user_id"), "conversation_read_states", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_conversation_read_states_user_id"), table_name="conversation_read_states")
    op.drop_index(op.f("ix_conversation_read_states_conversation_id"), table_name="conversation_read_states")
    op.drop_index(op.f("ix_conversation_read_states_business_id"), table_name="conversation_read_states")
    op.drop_table("conversation_read_states")
