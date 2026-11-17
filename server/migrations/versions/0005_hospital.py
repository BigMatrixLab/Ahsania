"""hospital link: what was imported from the hospital system, and how sending back went

Revision ID: 0005
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("hospital_snapshot", postgresql.JSONB(), nullable=True))
    op.add_column("records", sa.Column("hospital_sync", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "hospital_sync")
    op.drop_column("records", "hospital_snapshot")
