from contextlib import contextmanager
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


class Database:
    def __init__(self, url: str):
        self.pool = ConnectionPool(url, min_size=1, max_size=12, open=False,
                                   kwargs={"row_factory": dict_row})

    def open(self):
        self.pool.open(wait=True, timeout=15)
        with self.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(684913290)")
            if connection.execute("SELECT to_regclass('schema_versions') AS name").fetchone()["name"]:
                current = connection.execute("SELECT max(version) AS version FROM schema_versions").fetchone()["version"]
                if current and current > 1:
                    raise RuntimeError("数据库版本高于当前程序，请升级程序；没有改动数据")
            connection.execute(Path(__file__).with_name("schema.sql").read_text())

    @contextmanager
    def connection(self):
        with self.pool.connection() as connection, connection.transaction():
            yield connection

    def close(self):
        self.pool.close()
