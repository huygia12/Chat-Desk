"""add message attachments

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("attachment_url", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("attachment_filename", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("attachment_mime_type", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("attachment_size", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("attachment_kind", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "attachment_kind")
    op.drop_column("messages", "attachment_size")
    op.drop_column("messages", "attachment_mime_type")
    op.drop_column("messages", "attachment_filename")
    op.drop_column("messages", "attachment_url")
