#!/usr/bin/env python3
"""
Check customer verification status and token details
"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal
from app.models import Customer
from datetime import datetime, timezone

def check_customers():
    """Check customer verification details"""
    db = SessionLocal()
    try:
        # Get all unverified customers
        customers = db.query(Customer).filter(
            Customer.email_verified == False
        ).all()
        
        print(f"Found {len(customers)} unverified customers\n")
        
        for customer in customers:
            print(f"{'='*60}")
            print(f"Email: {customer.email}")
            print(f"Name: {customer.name}")
            print(f"Organization ID: {customer.org_id}")
            print(f"Verified: {customer.email_verified}")
            print(f"Has Token: {customer.verification_token is not None}")
            
            if customer.verification_token:
                print(f"Token (first 20 chars): {customer.verification_token[:20]}...")
                print(f"Token Expires: {customer.verification_token_expires}")
                print(f"Timezone Aware: {customer.verification_token_expires.tzinfo is not None if customer.verification_token_expires else 'N/A'}")
                
                if customer.verification_token_expires:
                    now = datetime.now(timezone.utc)
                    print(f"Current UTC: {now}")
                    is_expired = customer.verification_token_expires < now
                    print(f"Is Expired: {is_expired}")
                    if not is_expired:
                        time_left = customer.verification_token_expires - now
                        print(f"Time Left: {time_left}")
            
            print(f"{'='*60}\n")
            
    finally:
        db.close()

if __name__ == "__main__":
    check_customers()
