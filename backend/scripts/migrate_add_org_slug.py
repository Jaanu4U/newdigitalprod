#!/usr/bin/env python3
"""
Adds slug and custom_domain columns to organizations table if missing,
and creates unique indexes. Works with SQLite and Postgres.

Usage:
  python backend/scripts/migrate_add_org_slug.py

Reads DATABASE_URL env var like the app (defaults to sqlite:///./digitalchain.db)
"""
import os
from sqlalchemy import create_engine, text, inspect

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digitalchain.db")
engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    insp = inspect(conn)
    cols = {c['name'] for c in insp.get_columns('organizations')}

    # Add columns if missing
    if 'slug' not in cols:
        print("Adding organizations.slug ...")
        conn.execute(text("ALTER TABLE organizations ADD COLUMN slug VARCHAR"))
    if 'custom_domain' not in cols:
        print("Adding organizations.custom_domain ...")
        conn.execute(text("ALTER TABLE organizations ADD COLUMN custom_domain VARCHAR"))

    # Create unique indexes (SQLite treats NULLs as distinct; Postgres too with unique index)
    print("Creating unique indexes if not exist ...")
    try:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)"))
    except Exception as e:
        print("Note: could not create idx_organizations_slug (may already exist):", e)
    try:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_custom_domain ON organizations(custom_domain)"))
    except Exception as e:
        print("Note: could not create idx_organizations_custom_domain (may already exist):", e)

print("Migration completed.")
