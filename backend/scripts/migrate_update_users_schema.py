#!/usr/bin/env python3
"""
Ensures users table has expected columns present in models: cellnumber, team, mfa_enabled, status, last_login, created_at.
Works with SQLite and Postgres.

Usage:
  DATABASE_URL=... python backend/scripts/migrate_update_users_schema.py
"""
import os
from sqlalchemy import create_engine, text, inspect

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digitalchain.db")
engine = create_engine(DATABASE_URL)

ADD_CMDS = {
    'cellnumber': "ALTER TABLE users ADD COLUMN cellnumber VARCHAR",
    'team': "ALTER TABLE users ADD COLUMN team VARCHAR",
    'mfa_enabled': "ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE",
    'status': "ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'active'",
    'last_login': "ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL",
    'created_at': "ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW()",
}

with engine.begin() as conn:
    insp = inspect(conn)
    cols = {c['name'] for c in insp.get_columns('users')}
    for col, sql in ADD_CMDS.items():
        if col not in cols:
            print(f"Adding users.{col} ...")
            try:
                conn.execute(text(sql))
            except Exception as e:
                print(f"Warning: could not add column {col}: {e}")
        else:
            print(f"users.{col} exists")

print("Migration completed.")
