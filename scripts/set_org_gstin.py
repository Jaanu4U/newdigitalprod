#!/usr/bin/env python3
import os, re, json, sys
from sqlalchemy import create_engine, text

if len(sys.argv) < 3:
    print("Usage: set_org_gstin.py <slug|org_id> <GSTIN>")
    sys.exit(1)
key = sys.argv[1].strip()
val = sys.argv[2].strip().upper()
if not re.fullmatch(r"^[0-9A-Z]{15}$", val):
    print("Invalid GSTIN: must be 15 uppercase alphanumeric characters")
    sys.exit(2)
# DB URL
url = None
try:
    with open('/etc/digitalchain/backend.env','r') as f:
        for line in f:
            m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
            if m:
                url = m.group(1).strip()
                break
except Exception:
    pass
if not url:
    url = os.getenv('DATABASE_URL', 'postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain')
engine = create_engine(url)

with engine.begin() as conn:
    # find by slug or org_id
    row = conn.execute(text("select org_id, name, slug, settings from organizations where org_id=:k or slug=:k"), {"k": key}).mappings().first()
    if not row:
        print("Organization not found for key:", key)
        sys.exit(3)
    s = row.get('settings') or {}
    if not isinstance(s, dict):
        s = {}
    biz = s.get('business') or s.get('business_settings') or {}
    if not isinstance(biz, dict):
        biz = {}
    biz['gstin'] = val
    # normalize to canonical key 'business'
    s.pop('business_settings', None)
    s['business'] = biz
    conn.execute(text("update organizations set settings=:s where org_id=:id"), {"s": json.dumps(s), "id": row['org_id']})
    print(json.dumps({"org_id": row['org_id'], "slug": row.get('slug'), "gstin": val}, indent=2))
