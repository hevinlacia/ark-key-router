from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path


class StateStore:
    """Persists frozen keys and session bindings to SQLite.

    Frozen keys (quota/auth freezes) and session bindings (session affinity) are
    part of the router state surfaced on the dashboard. Keeping them in SQLite
    means they survive restarts and blue/green hot depays instead of being lost,
    so a key frozen for a 24h monthly quota is not retried immediately after a
    deploy, and active sessions keep their bound key.
    """

    def __init__(self, db_path: str):
        self.db_path = os.path.expanduser(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS frozen_keys (
                    key_name TEXT PRIMARY KEY,
                    until REAL NOT NULL,
                    reason TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_bindings (
                    alias TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    key_name TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    PRIMARY KEY (alias, session_id)
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_bindings_expires "
                "ON session_bindings(expires_at)"
            )

    def load_frozen(self) -> dict[str, tuple[float, str]]:
        """Return ``{key_name: (until, reason)}`` for entries still in the future."""
        now = time.time()
        with self._lock:
            rows = self._conn.execute(
                "SELECT key_name, until, reason FROM frozen_keys WHERE until > ?",
                (now,),
            ).fetchall()
        return {
            str(row["key_name"]): (float(row["until"]), str(row["reason"])) for row in rows
        }

    def upsert_frozen(self, key_name: str, until: float, reason: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO frozen_keys(key_name, until, reason)
                VALUES (?, ?, ?)
                ON CONFLICT(key_name) DO UPDATE
                  SET until = excluded.until, reason = excluded.reason
                  WHERE excluded.until > frozen_keys.until
                """,
                (key_name, until, reason),
            )

    def delete_frozen(self, key_names: list[str]) -> None:
        if not key_names:
            return
        placeholders = ", ".join("?" for _ in key_names)
        with self._lock, self._conn:
            self._conn.execute(
                f"DELETE FROM frozen_keys WHERE key_name IN ({placeholders})",
                tuple(key_names),
            )

    def clear_frozen(self) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM frozen_keys")

    def load_bindings(self) -> dict[tuple[str, str], tuple[str, float]]:
        """Return ``{(alias, session_id): (key_name, expires_at)}`` not yet expired."""
        now = time.time()
        with self._lock:
            rows = self._conn.execute(
                "SELECT alias, session_id, key_name, expires_at "
                "FROM session_bindings WHERE expires_at > ?",
                (now,),
            ).fetchall()
        return {
            (str(row["alias"]), str(row["session_id"])): (
                str(row["key_name"]),
                float(row["expires_at"]),
            )
            for row in rows
        }

    def upsert_binding(
        self, alias: str, session_id: str, key_name: str, expires_at: float
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO session_bindings(alias, session_id, key_name, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(alias, session_id) DO UPDATE
                  SET key_name = excluded.key_name, expires_at = excluded.expires_at
                """,
                (alias, session_id, key_name, expires_at),
            )

    def delete_bindings(self, keys: list[tuple[str, str]]) -> None:
        if not keys:
            return
        with self._lock, self._conn:
            for alias, session_id in keys:
                self._conn.execute(
                    "DELETE FROM session_bindings WHERE alias = ? AND session_id = ?",
                    (alias, session_id),
                )

    def delete_bindings_for_keys(self, key_names: set[str]) -> None:
        if not key_names:
            return
        placeholders = ", ".join("?" for _ in key_names)
        with self._lock, self._conn:
            self._conn.execute(
                f"DELETE FROM session_bindings WHERE key_name IN ({placeholders})",
                tuple(key_names),
            )
