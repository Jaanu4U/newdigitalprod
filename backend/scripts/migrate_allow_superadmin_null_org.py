#!/usr/bin/env python3
"""
Make users.org_id nullable to allow SuperAdmin users (orgless).

Supports Postgres directly. For SQLite, this is a no-op (SQLite can't easily drop NOT NULL without table recreate).

Usage:
  DATABASE_URL=... python backend/scripts/migrate_allow_superadmin_null_org.py
"""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digitalchain.db")
engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    dialect = conn.dialect.name
    if dialect in ("postgresql", "postgres", "postgresql+psycopg2"):
        print("Altering users.org_id to be NULLABLE (Postgres)...")
        try:
            conn.execute(text("ALTER TABLE users ALTER COLUMN org_id DROP NOT NULL"))
            print("Done.")
        except Exception as e:
            print(f"Warning: could not alter users.org_id: {e}")
    else:
        print(f"Dialect '{dialect}' not explicitly handled; skipping (no-op).")

print("Migration completed.")
