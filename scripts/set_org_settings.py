#!/usr/bin/env python3
"""
Create or replace organization settings from JSON (stdin, file, or argument).

Usage examples:
  python scripts/set_org_settings.py <slug|org_id> --json '{"business": {"address": "..."}}'
  python scripts/set_org_settings.py <slug|org_id> --file settings.json
  cat settings.json | python scripts/set_org_settings.py <slug|org_id>

Notes:
  - Provided sections overwrite existing ones (canonical keys: business, payment, email, maps)
  - Business normalization: uppercase gstin/company_registration/drug_license; FSSAI digits-only; address trimmed
  - Keys with alias names (e.g., payment_settings) are accepted and normalized to canonical

DB connection resolution:
  - Reads DATABASE_URL from /etc/digitalchain/backend.env if present
  - Otherwise uses env var DATABASE_URL
  - Fallback: postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain
"""
import os, re, json, sys, argparse
from typing import Any, Dict
from sqlalchemy import create_engine, text

def get_db_url() -> str:
    try:
        with open('/etc/digitalchain/backend.env', 'r') as f:
            for line in f:
                m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)\s*$", line)
                if m:
                    return m.group(1).strip()
    except Exception:
        pass
    return os.getenv('DATABASE_URL', 'postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain')

def normalize_business(biz: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (biz or {}).items():
        if isinstance(v, str):
            if k in {"gstin", "company_registration", "drug_license"}:
                out[k] = v.upper()
            elif k == "fssai":
                out[k] = re.sub(r"\D", "", v)
            elif k == "address":
                out[k] = v.strip()
            else:
                out[k] = v
        else:
            out[k] = v
    return out

def validate_business(biz: Dict[str, Any]) -> None:
    gst = (biz.get('gstin') or '').strip()
    if gst and not re.fullmatch(r"^[0-9A-Z]{15}$", gst):
        raise SystemExit("Invalid GSTIN format (expect 15 alphanumeric uppercase characters)")
    fssai = (biz.get('fssai') or '').strip()
    if fssai and not re.fullmatch(r"^[0-9]{14}$", fssai):
        raise SystemExit("Invalid FSSAI number (expect 14 digits)")

def main():
    parser = argparse.ArgumentParser(description="Create or replace organization settings from JSON.")
    parser.add_argument('key', help='Organization slug or org_id')
    parser.add_argument('--json', dest='json_text', help='JSON string for settings')
    parser.add_argument('--file', dest='file_path', help='Path to JSON file for settings')
    args = parser.parse_args()

    # Read input JSON
    data_text: str | None = None
    if args.json_text:
        data_text = args.json_text
    elif args.file_path:
        with open(args.file_path, 'r') as f:
            data_text = f.read()
    else:
        # read from stdin if available
        if not sys.stdin.isatty():
            data_text = sys.stdin.read()
    if not data_text:
        print('Provide settings JSON via --json, --file, or stdin')
        sys.exit(1)

    try:
        incoming = json.loads(data_text)
    except Exception as e:
        print('Invalid JSON:', e)
        sys.exit(2)
    if not isinstance(incoming, dict):
        print('Settings JSON must be an object at top level')
        sys.exit(2)

    # Accept aliases and normalize to canonical keys
    business = incoming.get('business') or incoming.get('business_settings')
    payment  = incoming.get('payment')  or incoming.get('payment_settings')
    email    = incoming.get('email')    or incoming.get('email_settings')
    maps     = incoming.get('maps')     or incoming.get('maps_settings')

    if business is not None and not isinstance(business, dict):
        print('business must be an object')
        sys.exit(2)
    if payment is not None and not isinstance(payment, dict):
        print('payment must be an object')
        sys.exit(2)
    if email is not None and not isinstance(email, dict):
        print('email must be an object')
        sys.exit(2)
    if maps is not None and not isinstance(maps, dict):
        print('maps must be an object')
        sys.exit(2)

    # Normalize business content and validate minimal constraints
    if business is not None:
        business = normalize_business(business)
        validate_business(business)

    url = get_db_url()
    engine = create_engine(url)
    with engine.begin() as conn:
        row = conn.execute(text("select org_id, name, slug, settings from organizations where org_id=:k or slug=:k"), {"k": args.key}).mappings().first()
        if not row:
            print("Organization not found for key:", args.key)
            sys.exit(3)
        # Start from current settings, then replace sections provided
        s: Dict[str, Any] = row.get('settings') or {}
        if not isinstance(s, dict):
            s = {}
        # Remove alias keys if present to avoid duplication
        for alias in ('business_settings','payment_settings','email_settings','maps_settings'):
            s.pop(alias, None)
        if business is not None:
            s['business'] = business
        if payment is not None:
            s['payment'] = payment
        if email is not None:
            s['email'] = email
        if maps is not None:
            s['maps'] = maps
        conn.execute(text("update organizations set settings=:s where org_id=:id"), {"s": json.dumps(s), "id": row['org_id']})
        print(json.dumps({
            'org_id': row['org_id'],
            'slug': row.get('slug'),
            'updated_sections': [k for k in ['business','payment','email','maps'] if k in (incoming.keys() | set())],
            'settings': s,
        }, indent=2))

if __name__ == '__main__':
    main()
