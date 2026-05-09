"""add telegram to platform_type enum

Revision ID: a1b2c3d4e5f6
Revises: 7295b3d8957d
Create Date: 2026-02-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = '7295b3d8957d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add 'telegram' value to existing platform_type enum
    op.execute("ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'telegram'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values easily.
    # This is a no-op for downgrade; the extra enum value won't cause harm.
    pass
