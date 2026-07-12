from contextlib import contextmanager

from app.core import queue


class RecordingCursor:
    def __init__(self):
        self.query = ""
        self.params = ()

    def execute(self, query, params):
        self.query = query
        self.params = params


def test_enqueue_requeues_legacy_rows_for_source_attribution(monkeypatch):
    cursor = RecordingCursor()

    @contextmanager
    def fake_db_cursor():
        yield cursor

    monkeypatch.setattr(queue, "db_cursor", fake_db_cursor)

    queue.enqueue_url(
        "https://docs.example.test/guide",
        depth=1,
        priority=20,
        source_slug="docs",
    )

    assert "COALESCE(crawl_queue.source_slug, EXCLUDED.source_slug)" in cursor.query
    assert "crawl_queue.source_slug IS NULL" in cursor.query
    assert "THEN 'pending'" in cursor.query
    assert cursor.params[-1] == "docs"
