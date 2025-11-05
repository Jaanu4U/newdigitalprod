#!/usr/bin/env python3
"""
Adds cellnumber column to users table if missing.
Works with SQLite and Postgres.

Usage:
  DATABASE_URL=... python backend/scripts/migrate_add_user_cellnumber.py

Reads DATABASE_URL env var like the app (defaults to sqlite:///./digitalchain.db)
"""
import os
from sqlalchemy import create_engine, text, inspect

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digitalchain.db")
engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    insp = inspect(conn)
    cols = {c['name'] for c in insp.get_columns('users')}

    if 'cellnumber' not in cols:
        print("Adding users.cellnumber ...")
        conn.execute(text("ALTER TABLE users ADD COLUMN cellnumber VARCHAR"))
    else:
        print("users.cellnumber already exists; nothing to do")

print("Migration completed.")
