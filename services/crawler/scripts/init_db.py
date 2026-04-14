from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.connection import db_cursor
from app.db.schema import MIGRATION_SQL, SCHEMA_SQL


def main() -> None:
    with db_cursor() as cur:
        cur.execute(SCHEMA_SQL)
        cur.execute(MIGRATION_SQL)


if __name__ == "__main__":
    main()
