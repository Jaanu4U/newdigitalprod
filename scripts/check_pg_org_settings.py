#!/usr/bin/env python3
import os, re, json
from sqlalchemy import create_engine, text

# Load DATABASE_URL from backend env file
env_path = "/etc/digitalchain/backend.env"
url = None
try:
    with open(env_path, 'r') as f:
        for line in f:
            m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
            if m:
                url = m.group(1).strip()
                break
except Exception as e:
    pass
if not url:
    url = os.getenv('DATABASE_URL', 'postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain')

term = (os.environ.get('SEARCH') or '').strip().lower()
if not term:
    print('Set SEARCH env var to a substring of org name/slug, e.g. SEARCH=jugesh')
    raise SystemExit(1)

engine = create_engine(url)
with engine.connect() as conn:
    q = text("""
        select org_id, name, slug, settings
        from organizations
        where lower(name) like :like or lower(coalesce(slug,'')) like :like
        order by name
    """)
    rows = conn.execute(q, {"like": f"%{term}%"}).mappings().all()
    out = []
    for r in rows:
        s = r.get('settings') or {}
        business = (s.get('business') or s.get('business_settings') or {}) if isinstance(s, dict) else {}
        out.append({
            'org_id': r['org_id'],
            'name': r['name'],
            'slug': r.get('slug'),
            'gstin': business.get('gstin'),
            'business': business,
        })
    print(json.dumps(out, indent=2))
