from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'import_batch',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('file_name', sa.String(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rows_ok', sa.Integer(), nullable=True),
        sa.Column('rows_error', sa.Integer(), nullable=True),
        sa.Column('warnings', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_table(
        'transaction_raw',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('import_batch_id', sa.Integer(), sa.ForeignKey('import_batch.id'), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('row_hash', sa.String(), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('provenance', sa.JSON(), nullable=False),
        sa.UniqueConstraint('row_hash')
    )
    op.create_table(
        'price_point',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('dt_utc', sa.DateTime(timezone=True), nullable=False),
        sa.Column('asset', sa.String(), nullable=False),
        sa.Column('quote', sa.String(), nullable=False, server_default='USD'),
        sa.Column('price', sa.Numeric(38, 18), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.UniqueConstraint('asset', 'quote', 'dt_utc', 'source', name='uix_pricepoint')
    )


def downgrade():
    op.drop_table('price_point')
    op.drop_table('transaction_raw')
    op.drop_table('import_batch')
