"""add saved replies

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-05-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd9e0f1a2b3c4'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'saved_reply_visibility'
            ) THEN
                CREATE TYPE saved_reply_visibility AS ENUM ('business', 'personal');
            END IF;
        END$$;
    """)

    visibility_enum = postgresql.ENUM(
        'business',
        'personal',
        name='saved_reply_visibility',
        create_type=False,
    )

    op.create_table(
        'saved_replies',

        sa.Column('id', sa.UUID(), nullable=False),

        sa.Column('business_id', sa.UUID(), nullable=False),

        sa.Column('owner_id', sa.UUID(), nullable=True),

        sa.Column(
            'visibility',
            visibility_enum,
            nullable=False
        ),

        sa.Column('title', sa.String(length=120), nullable=False),

        sa.Column('shortcut', sa.String(length=80), nullable=False),

        sa.Column('content', sa.Text(), nullable=False),

        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),

        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),

        sa.ForeignKeyConstraint(
            ['business_id'],
            ['users.id'],
            ondelete='CASCADE'
        ),

        sa.ForeignKeyConstraint(
            ['owner_id'],
            ['users.id'],
            ondelete='CASCADE'
        ),

        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index(
        op.f('ix_saved_replies_business_id'),
        'saved_replies',
        ['business_id'],
        unique=False
    )

    op.create_index(
        op.f('ix_saved_replies_owner_id'),
        'saved_replies',
        ['owner_id'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_saved_replies_owner_id'),
        table_name='saved_replies'
    )

    op.drop_index(
        op.f('ix_saved_replies_business_id'),
        table_name='saved_replies'
    )

    op.drop_table('saved_replies')

    op.execute("DROP TYPE IF EXISTS saved_reply_visibility")
