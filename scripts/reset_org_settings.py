#!/usr/bin/env python3
"""
Reset (remove) organization settings fully or by section.

Usage examples:
  python scripts/reset_org_settings.py <slug|org_id>
  python scripts/reset_org_settings.py <slug|org_id> --sections business,payment

Sections supported: business, payment, email, maps
If --sections is omitted, ALL sections will be removed (settings cleared).

DB connection resolution:
  - Reads DATABASE_URL from /etc/digitalchain/backend.env if present
  - Otherwise uses env var DATABASE_URL
  - Fallback: postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain
"""
import os, re, json, sys, argparse
from sqlalchemy import create_engine, text

def get_db_url() -> str:
    # Try /etc/digitalchain/backend.env first
    try:
        with open('/etc/digitalchain/backend.env', 'r') as f:
            for line in f:
                m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
                if m:
                    return m.group(1).strip()
    except Exception:
        pass
    return os.getenv('DATABASE_URL', 'postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain')

parser = argparse.ArgumentParser(description="Reset (remove) organization settings fully or by section.")
parser.add_argument('key', help='Organization slug or org_id')
parser.add_argument('--sections', help='Comma-separated sections to remove (business,payment,email,maps). Omit to clear all.', default=None)
args = parser.parse_args()

sections = None
if args.sections:
    sections = [s.strip().lower() for s in args.sections.split(',') if s.strip()]
    invalid = [s for s in sections if s not in {'business','payment','email','maps'}]
    if invalid:
        print('Invalid sections:', ', '.join(invalid))
        sys.exit(2)

engine = create_engine(get_db_url())
with engine.begin() as conn:
    row = conn.execute(text("select org_id, name, slug, settings from organizations where org_id=:k or slug=:k"), {"k": args.key}).mappings().first()
    if not row:
        print("Organization not found for key:", args.key)
        sys.exit(3)
    current = row.get('settings') or {}
    if not isinstance(current, dict):
        current = {}

    removed = []
    if not sections:
        # Clear everything
        current = {}
        removed = ['business','payment','email','maps']
    else:
        for sec in sections:
            # Remove canonical and alias keys
            if sec == 'business':
                current.pop('business', None)
                current.pop('business_settings', None)
            elif sec == 'payment':
                current.pop('payment', None)
                current.pop('payment_settings', None)
            elif sec == 'email':
                current.pop('email', None)
                current.pop('email_settings', None)
            elif sec == 'maps':
                current.pop('maps', None)
                current.pop('maps_settings', None)
            removed.append(sec)

    conn.execute(text("update organizations set settings=:s where org_id=:id"), {"s": json.dumps(current), "id": row['org_id']})
    print(json.dumps({
        "org_id": row['org_id'],
        "slug": row.get('slug'),
        "removed_sections": removed,
        "settings": current,
    }, indent=2))
