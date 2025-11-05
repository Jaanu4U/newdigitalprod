#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

# Ensure we can import from app/
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal  # type: ignore
from app import models  # type: ignore
from app.security import hash_password  # type: ignore


def ensure_org_and_admin(org_name: str, admin_email: str, admin_password: str, admin_name: str | None = None):
    db = SessionLocal()
    try:
        # Find org by name or create
        org = db.query(models.Organization).filter(models.Organization.name == org_name).first()
        created_org = False
        if not org:
            org = models.Organization(name=org_name, access_key="default")
            db.add(org)
            db.flush()  # populate org_id
            created_org = True

        # Find user by email within org or create
        user = (
            db.query(models.User)
            .filter(models.User.org_id == org.org_id, models.User.email == admin_email)
            .first()
        )
        created_user = False
        if not user:
            user = models.User(
                org_id=org.org_id,
                email=admin_email,
                name=admin_name or "Admin",
                role="Admin",
                password_hash=hash_password(admin_password),
            )
            db.add(user)
            created_user = True

        db.commit()
        return {
            "org_id": org.org_id,
            "org_created": created_org,
            "user_id": user.user_id,
            "user_created": created_user,
        }
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Seed default organization and admin user")
    parser.add_argument("--org-name", default="Digitalchain", help="Organization name to create/use")
    parser.add_argument("--admin-email", default="admin@digitalchain.in", help="Admin email")
    parser.add_argument(
        "--admin-password",
        default="Admin@123!",
        help="Admin password (use a strong one; avoid leaving defaults in production)",
    )
    parser.add_argument("--admin-name", default="Admin", help="Admin display name")

    args = parser.parse_args()
    res = ensure_org_and_admin(args.org_name, args.admin_email, args.admin_password, args.admin_name)

    print("=== Seed Result ===")
    print(f"Organization: {args.org_name}")
    print(f"  org_id: {res['org_id']} (created={res['org_created']})")
    print("Admin User:")
    print(f"  email: {args.admin_email}")
    print(f"  user_id: {res['user_id']} (created={res['user_created']})")
    # Print the password only if we just created the user
    if res["user_created"]:
        print(f"  password: {args.admin_password}")
    else:
        print("  password: (unchanged)")


if __name__ == "__main__":
    main()
