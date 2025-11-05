#!/usr/bin/env python3
"""
Simple functional smoke test for admin login.
- Ensures tables exist
- Ensures default org+admin exist (idempotent)
- Calls /v1/auth/login and validates the response
"""
import sys
from pathlib import Path

# Allow importing from backend/app
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import Base, engine  # type: ignore
from app import models  # type: ignore
from app.main import app  # type: ignore
from fastapi.testclient import TestClient  # type: ignore

# Seeder
seed_path = ROOT / "scripts" / "seed_admin.py"
if not seed_path.exists():
    print("ERROR: seed_admin.py not found; aborting.")
    sys.exit(2)

# 1) Ensure tables exist
Base.metadata.create_all(bind=engine)

# 2) Ensure default org and admin exist
from scripts.seed_admin import ensure_org_and_admin  # type: ignore

ORG_NAME = "Digitalchain"
ADMIN_EMAIL = "admin@digitalchain.in"
ADMIN_PASSWORD = "Admin@123!"

seed_res = ensure_org_and_admin(ORG_NAME, ADMIN_EMAIL, ADMIN_PASSWORD)
org_id = seed_res["org_id"]

# 3) Functional call
client = TestClient(app)

payload = {
    "email": ADMIN_EMAIL,
    "password": ADMIN_PASSWORD,
    "org_id": org_id,
}

resp = client.post("/v1/auth/login", json=payload)

print("=== Admin Login Smoke Test ===")
print(f"Status: {resp.status_code}")

if resp.status_code != 200:
    try:
        print("Response:", resp.json())
    except Exception:
        print("Response text:", resp.text)
    print("RESULT: FAIL")
    sys.exit(1)

js = resp.json()
missing = [k for k in ("access_token", "refresh_token", "user", "org_id") if k not in js]
if missing:
    print("Missing keys:", missing)
    print("Body:", js)
    print("RESULT: FAIL")
    sys.exit(1)

if js.get("org_id") != org_id:
    print("org_id mismatch:", js.get("org_id"), "!=", org_id)
    print("RESULT: FAIL")
    sys.exit(1)

user = js.get("user") or {}
role = user.get("role")
print("role:", role)

if role not in ("Admin", "SuperAdmin"):
    print("Unexpected role:", role)
    print("RESULT: FAIL")
    sys.exit(1)

print("Tokens: access=present, refresh=present")
print("RESULT: PASS")
