"""bounties never expire: expires_at nullable

Revision ID: a1b2c3d4e5f6
Revises: c80818975b8f
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "c80818975b8f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("bounties") as batch_op:
        batch_op.alter_column("expires_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.execute("UPDATE bounties SET expires_at = NULL")


def downgrade() -> None:
    op.execute("UPDATE bounties SET expires_at = created_at WHERE expires_at IS NULL")
    with op.batch_alter_table("bounties") as batch_op:
        batch_op.alter_column("expires_at", existing_type=sa.DateTime(timezone=True), nullable=False)
