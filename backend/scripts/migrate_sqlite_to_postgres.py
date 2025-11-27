#!/usr/bin/env python3
"""
Migrate data from the current SQLite database to PostgreSQL using SQLAlchemy ORM.

- Reads source from SQLITE_URL (default: sqlite:///./digitalchain.db)
- Reads target from DATABASE_URL or POSTGRES_URL
- Creates target schema if missing (based on current models)
- Copies tables in dependency order, preserving IDs
- Idempotent via session.merge()
- Resets Postgres sequences where applicable (e.g., sync_log.id)

Usage:
  python backend/scripts/migrate_sqlite_to_postgres.py \
      --sqlite sqlite:///./digitalchain.db \
      --postgres postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain
"""
import argparse
import os
import re
from typing import List, Type, Dict, Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine

from app.models import Base, Organization, User, Customer, Delivery, SyncLog


def get_args():
    p = argparse.ArgumentParser(description="Migrate SQLite -> Postgres")
    p.add_argument("--sqlite", dest="sqlite_url", default=os.getenv("SQLITE_URL", "sqlite:///./digitalchain.db"))
    p.add_argument(
        "--postgres",
        dest="postgres_url",
        default=os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL"),
        required=False,
    )
    return p.parse_args()


def count_rows(session, model: Type[Base]) -> int:
    return session.query(model).count()


def slugify(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip('-')
    return base[:48] if base else ""


def fetch_existing_slugs(dst_engine: Engine) -> set:
    existing = set()
    try:
        with dst_engine.connect() as conn:
            res = conn.execute(text("SELECT slug FROM organizations WHERE slug IS NOT NULL"))
            for (slug,) in res.fetchall():
                if slug:
                    existing.add(slug)
    except Exception:
        pass
    return existing


def copy_table(src_engine: Engine, dst_sess, model: Type[Base]):
    table = model.__tablename__
    target_cols = [c.name for c in model.__table__.columns]
    # Introspect source columns (works for SQLite via PRAGMA; for other DB fallback to target cols)
    src_cols = set()
    with src_engine.connect() as conn:
        try:
            if src_engine.dialect.name == 'sqlite':
                pragma = conn.execute(text(f"PRAGMA table_info({table})"))
                for row in pragma.fetchall():
                    src_cols.add(row[1])  # second field is column name
            else:
                # generic fallback: describe via selecting zero rows
                res = conn.execute(text(f"SELECT * FROM {table} LIMIT 0"))
                src_cols.update(res.keys())
        except Exception:
            return 0, 0
        # Build dynamic select using intersection
        select_cols = [c for c in target_cols if c in src_cols]
        if not select_cols:
            return 0, 0
        rows = conn.execute(text(f"SELECT {', '.join(select_cols)} FROM {table}"))
        result_rows = rows.mappings().all()

    # Special handling for organizations: generate slug if missing
    slug_set = fetch_existing_slugs(dst_sess.bind) if model is Organization else set()

    inserted = 0
    for row_map in result_rows:
        data: Dict[str, Any] = {}
        for col in target_cols:
            if col in row_map:
                data[col] = row_map[col]
        # Fill missing columns with None
        for col in target_cols:
            data.setdefault(col, None)
        if model is Organization:
            if not data.get("slug") and data.get("name"):
                cand = slugify(data["name"]) or data.get("org_id", "org")[:8]
                base = cand
                i = 2
                while cand in slug_set:
                    cand = f"{base}-{i}"
                    i += 1
                data["slug"] = cand
                slug_set.add(cand)
        # Merge (upsert)
        dst_sess.merge(model(**data))
        inserted += 1
    dst_sess.commit()
    return inserted, len(result_rows)


def reset_sequences_postgres(dst_engine):
    try:
        with dst_engine.connect() as conn:
            # Reset sequence for sync_log.id if needed
            conn.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence('sync_log','id'), COALESCE((SELECT MAX(id) FROM sync_log), 0))"
                )
            )
            conn.commit()
    except Exception as e:
        # Best effort; may be running against non-Postgres or missing permissions
        print(f"[warn] sequence reset skipped: {e}")


def main():
    args = get_args()
    if not args.postgres_url:
        raise SystemExit("Missing --postgres or DATABASE_URL/POSTGRES_URL env for target")

    print(f"[info] source (sqlite):   {args.sqlite_url}")
    print(f"[info] target (postgres): {args.postgres_url}")

    src_engine = create_engine(args.sqlite_url, future=True)
    dst_engine = create_engine(args.postgres_url, future=True)

    SrcSession = sessionmaker(bind=src_engine, autoflush=False, autocommit=False, future=True)
    DstSession = sessionmaker(bind=dst_engine, autoflush=False, autocommit=False, future=True)

    # Ensure target schema exists
    Base.metadata.create_all(bind=dst_engine)

    with DstSession() as sdst:
        order: List[Type[Base]] = [Organization, User, Customer, Delivery, SyncLog]
        for model in order:
            before = count_rows(sdst, model)
            n_inserted, n_src = copy_table(src_engine, sdst, model)
            after = count_rows(sdst, model)
            print(f"[ok] {model.__tablename__}: {before} -> {after} (copied {n_src}, inserted {n_inserted})")

    reset_sequences_postgres(dst_engine)
    print("[done] migration complete")


if __name__ == "__main__":
    main()
