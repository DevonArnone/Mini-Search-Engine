from app.db.connection import db_cursor
from app.db.schema import SCHEMA_SQL


def main() -> None:
    with db_cursor() as cur:
        cur.execute(SCHEMA_SQL)


if __name__ == "__main__":
    main()

