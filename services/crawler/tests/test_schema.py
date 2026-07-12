from app.db.schema import MIGRATION_SQL, SCHEMA_SQL


def test_analytics_indexes_run_after_additive_columns():
    assert "idx_search_analytics_search_id" not in SCHEMA_SQL
    assert "idx_search_analytics_event_created" not in SCHEMA_SQL
    assert "idx_search_analytics_unique_search" not in SCHEMA_SQL

    search_id_column = MIGRATION_SQL.index(
        "ALTER TABLE search_analytics ADD COLUMN IF NOT EXISTS search_id UUID"
    )
    event_type_column = MIGRATION_SQL.index(
        "ALTER TABLE search_analytics ADD COLUMN IF NOT EXISTS event_type"
    )
    dependent_indexes = MIGRATION_SQL.index(
        "CREATE INDEX IF NOT EXISTS idx_search_analytics_search_id"
    )

    assert dependent_indexes > search_id_column
    assert dependent_indexes > event_type_column
