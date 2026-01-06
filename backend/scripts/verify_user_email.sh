#!/bin/bash

# Quick script to manually verify a user's email
# Usage: ./verify_user_email.sh user@example.com

if [ -z "$1" ]; then
    echo "Usage: $0 <email>"
    echo "Example: $0 user@example.com"
    exit 1
fi

EMAIL="$1"

echo "=========================================="
echo "Manually Verifying Email: $EMAIL"
echo "=========================================="

cd /home/jugesh/digitalchain/newdigitalprod

/home/jugesh/digitalchain/newdigitalprod/backend/.venv/bin/python3 << EOF
from app.db import SessionLocal
from app.models import User
import sys

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == "${EMAIL}").first()
    if not user:
        print("❌ User not found: ${EMAIL}")
        sys.exit(1)
    
    if user.email_verified:
        print("ℹ️  Email already verified for: ${EMAIL}")
    else:
        user.email_verified = True
        user.verification_token = None
        user.token_expires_at = None
        db.commit()
        print("✅ Successfully verified email for: ${EMAIL}")
        
    # Show user details
    print(f"\nUser Details:")
    print(f"  ID: {user.user_id}")
    print(f"  Name: {user.name}")
    print(f"  Email: {user.email}")
    print(f"  Role: {user.role}")
    print(f"  Org ID: {user.org_id}")
    print(f"  Verified: {user.email_verified}")
    
except Exception as e:
    db.rollback()
    print(f"❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    db.close()
EOF

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
