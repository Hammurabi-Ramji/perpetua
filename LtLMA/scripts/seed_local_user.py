#!/usr/bin/env python3
"""Local/dev seed for PERPETUA (LtLMA) — bcrypt upsert into licenses.db."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import bcrypt
except ImportError:
    print("Missing bcrypt. Run: pip install bcrypt", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_SEED = SCRIPT_DIR / "seed.local.json"


def default_db() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "perpetua" / "licenses.db"
    return Path.home() / ".local" / "share" / "perpetua" / "licenses.db"


def load_seed(path: Path) -> dict:
    email = os.environ.get("PERPETUA_SEED_EMAIL")
    password = os.environ.get("PERPETUA_SEED_PASSWORD")
    if email and password:
        return {"email": email, "password": password}
    if not path.is_file():
        print(f"Missing {path}. Copy seed.local.json.example.", file=sys.stderr)
        sys.exit(1)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("email") or not data.get("password"):
        print("seed file needs email and password", file=sys.stderr)
        sys.exit(1)
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=os.environ.get("PERPETUA_SEED_DB") or str(default_db()))
    parser.add_argument("--seed-file", default=str(DEFAULT_SEED))
    args = parser.parse_args()

    seed = load_seed(Path(args.seed_file))
    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"DB not found: {db_path}. Start PERPETUA once, then re-run.", file=sys.stderr)
        sys.exit(2)

    pw_hash = bcrypt.hashpw(seed["password"].encode(), bcrypt.gensalt(rounds=12)).decode()
    now = datetime.now(timezone.utc).isoformat()
    email = seed["email"]

    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (pw_hash, row[0]),
            )
            print(f"updated user id={row[0]} email={email} db={db_path}")
        else:
            conn.execute(
                """
                INSERT INTO users (
                    email, password_hash, notification_email,
                    email_notifications, browser_notifications, created_at
                ) VALUES (?, ?, ?, 1, 0, ?)
                """,
                (email, pw_hash, email, now),
            )
            print(f"created user id={conn.execute('SELECT last_insert_rowid()').fetchone()[0]} email={email} db={db_path}")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
