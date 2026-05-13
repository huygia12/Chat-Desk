"""add conversation assignment

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-05-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e0f1a2b3c4d5'
down_revision: Union[str, None] = 'd9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'conversation_status'
            ) THEN
                CREATE TYPE conversation_status AS ENUM ('open', 'closed');
            END IF;
        END$$;
    """)
    status_enum = postgresql.ENUM('open', 'closed', name='conversation_status', create_type=False)

    op.add_column('conversations', sa.Column('status', status_enum, nullable=False, server_default='open'))
    op.add_column('conversations', sa.Column('assigned_to_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_conversations_assigned_to_id',
        'conversations',
        'users',
        ['assigned_to_id'],
        ['id'],
    )

    op.create_table(
        'assignment_settings',
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('employee_assignment_locked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('business_id'),
    )

    op.create_table(
        'conversation_assignment_history',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('actor_id', sa.UUID(), nullable=False),
        sa.Column('from_assignee_id', sa.UUID(), nullable=True),
        sa.Column('to_assignee_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['business_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['from_assignee_id'], ['users.id']),
        sa.ForeignKeyConstraint(['to_assignee_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_conversation_assignment_history_business_id'), 'conversation_assignment_history', ['business_id'], unique=False)
    op.create_index(op.f('ix_conversation_assignment_history_conversation_id'), 'conversation_assignment_history', ['conversation_id'], unique=False)

    op.create_table(
        'conversation_label_history',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), nullable=True),
        sa.Column('contact_id', sa.UUID(), nullable=False),
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('actor_id', sa.UUID(), nullable=False),
        sa.Column('label_id', sa.UUID(), nullable=False),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['business_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['label_id'], ['labels.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_conversation_label_history_business_id'), 'conversation_label_history', ['business_id'], unique=False)
    op.create_index(op.f('ix_conversation_label_history_contact_id'), 'conversation_label_history', ['contact_id'], unique=False)
    op.create_index(op.f('ix_conversation_label_history_conversation_id'), 'conversation_label_history', ['conversation_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_conversation_label_history_conversation_id'), table_name='conversation_label_history')
    op.drop_index(op.f('ix_conversation_label_history_contact_id'), table_name='conversation_label_history')
    op.drop_index(op.f('ix_conversation_label_history_business_id'), table_name='conversation_label_history')
    op.drop_table('conversation_label_history')
    op.drop_index(op.f('ix_conversation_assignment_history_conversation_id'), table_name='conversation_assignment_history')
    op.drop_index(op.f('ix_conversation_assignment_history_business_id'), table_name='conversation_assignment_history')
    op.drop_table('conversation_assignment_history')
    op.drop_table('assignment_settings')
    op.drop_constraint('fk_conversations_assigned_to_id', 'conversations', type_='foreignkey')
    op.drop_column('conversations', 'assigned_to_id')
    op.drop_column('conversations', 'status')
    op.execute("DROP TYPE IF EXISTS conversation_status")
