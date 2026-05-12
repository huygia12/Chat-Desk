"""Add employee role to users

Revision ID: b3c4d5e6f7a8
Revises: ff049b5c6f23
Create Date: 2026-05-11 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = '27d44da00847'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'employee' to the user_role enum (PostgreSQL specific)
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'employee'")

    # Add full_name column for employee display name
    op.add_column('users', sa.Column('full_name', sa.String(length=255), nullable=True))

    # Add business_id FK (self-referential: employee -> their business)
    op.add_column('users', sa.Column('business_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_users_business_id',
        'users', 'users',
        ['business_id'], ['id'],
        ondelete='CASCADE',
    )

    # Add is_active column (default True for all existing users)
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_constraint('fk_users_business_id', 'users', type_='foreignkey')
    op.drop_column('users', 'business_id')
    op.drop_column('users', 'full_name')
    op.drop_column('users', 'is_active')
    # Note: PostgreSQL does not support removing enum values easily; skipping enum downgrade
