from __future__ import annotations

from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.core.settings import settings


def get_connection() -> psycopg.Connection:
    return psycopg.connect(settings.database_url, row_factory=dict_row)


@contextmanager
def db_cursor():
    with get_connection() as conn:
        with conn.cursor() as cur:
            yield cur
        conn.commit()

