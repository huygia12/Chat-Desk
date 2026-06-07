"""add ai auto apply trigger to labels

Revision ID: a3b5c7d9e1f2
Revises: d3e4f5a6b7c8
Create Date: 2026-06-07 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3b5c7d9e1f2"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("labels", sa.Column("ai_auto_apply_trigger", sa.String(length=40), nullable=True))
    op.create_index(
        "ix_labels_business_ai_auto_apply_trigger",
        "labels",
        ["business_id", "ai_auto_apply_trigger"],
    )


def downgrade() -> None:
    op.drop_index("ix_labels_business_ai_auto_apply_trigger", table_name="labels")
    op.drop_column("labels", "ai_auto_apply_trigger")
