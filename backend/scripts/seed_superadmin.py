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


def ensure_superadmin(admin_email: str, admin_password: str, admin_name: str | None = None):
    db = SessionLocal()
    try:
        # Find SuperAdmin user by email or create
        user = (
            db.query(models.User)
            .filter(models.User.email == admin_email, models.User.role == "SuperAdmin")
            .first()
        )
        created_user = False
        if not user:
            user = models.User(
                org_id=None,  # SuperAdmin has no org
                email=admin_email,
                name=admin_name or "Super Admin",
                role="SuperAdmin",
                password_hash=hash_password(admin_password),
            )
            db.add(user)
            created_user = True

        db.commit()
        return {
            "user_id": user.user_id,
            "user_created": created_user,
        }
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Seed SuperAdmin user")
    parser.add_argument("--admin-email", default="superadmin@digitalchain.in", help="SuperAdmin email")
    parser.add_argument(
        "--admin-password",
        default="SuperAdmin@123!",
        help="SuperAdmin password (use a strong one; avoid leaving defaults in production)",
    )
    parser.add_argument("--admin-name", default="Super Admin", help="SuperAdmin display name")

    args = parser.parse_args()
    res = ensure_superadmin(args.admin_email, args.admin_password, args.admin_name)

    print("=== SuperAdmin Seed Result ===")
    print("SuperAdmin User:")
    print(f"  email: {args.admin_email}")
    print(f"  user_id: {res['user_id']} (created={res['user_created']})")
    # Print the password only if we just created the user
    if res["user_created"]:
        print(f"  password: {args.admin_password}")
    else:
        print("  password: (unchanged)")
    print("\nNote: SuperAdmin has access to ALL organizations.")
    print("Login endpoint: POST /v1/auth/superadmin-login")


if __name__ == "__main__":
    main()
