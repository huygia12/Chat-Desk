"""add contact visitor address

Revision ID: b5c6d7e8f9a0
Revises: a3b5c7d9e1f2
Create Date: 2026-06-15 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a3b5c7d9e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("visitor_address", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "visitor_address")
