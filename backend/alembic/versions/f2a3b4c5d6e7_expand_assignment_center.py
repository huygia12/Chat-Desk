"""expand assignment center

Revision ID: f2a3b4c5d6e7
Revises: b4c5d6e7f8a9
Create Date: 2026-05-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("assigned_to_business", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "assignment_settings",
        sa.Column("auto_assign_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "assignment_settings",
        sa.Column("auto_assign_strategy", sa.String(length=40), nullable=False, server_default="round_robin"),
    )
    op.add_column(
        "assignment_settings",
        sa.Column(
            "channel_assignment_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "assignment_settings",
        sa.Column(
            "label_assignment_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "assignment_settings",
        sa.Column("last_round_robin_assignee_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_assignment_settings_last_round_robin_assignee_id",
        "assignment_settings",
        "users",
        ["last_round_robin_assignee_id"],
        ["id"],
    )

    op.execute(
        """
        UPDATE conversations
        SET assigned_to_business = true
        WHERE assigned_to_id IS NULL
        """
    )

    op.alter_column("conversations", "assigned_to_business", server_default=None)
    op.alter_column("assignment_settings", "auto_assign_enabled", server_default=None)
    op.alter_column("assignment_settings", "auto_assign_strategy", server_default=None)
    op.alter_column("assignment_settings", "channel_assignment_rules", server_default=None)
    op.alter_column("assignment_settings", "label_assignment_rules", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        "fk_assignment_settings_last_round_robin_assignee_id",
        "assignment_settings",
        type_="foreignkey",
    )
    op.drop_column("assignment_settings", "last_round_robin_assignee_id")
    op.drop_column("assignment_settings", "label_assignment_rules")
    op.drop_column("assignment_settings", "channel_assignment_rules")
    op.drop_column("assignment_settings", "auto_assign_strategy")
    op.drop_column("assignment_settings", "auto_assign_enabled")
    op.drop_column("conversations", "assigned_to_business")
