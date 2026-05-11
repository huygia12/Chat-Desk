"""add widget platform: widget

Revision ID: 27d44da00847
Revises: cdadcf37744c
Create Date: 2026-05-11 10:30:28.569101
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '27d44da00847'
down_revision: Union[str, None] = 'cdadcf37744c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                WHERE enumlabel = 'widget'
            ) THEN
                ALTER TYPE platform_type ADD VALUE 'widget';
            END IF;
        END$$;
        """)
    pass


def downgrade() -> None:
    pass
