#!/usr/bin/env python3
"""
Fix timezone-aware datetime for existing customers with verification tokens
"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal
from app.models import Customer
from datetime import datetime, timezone

def fix_customer_tokens():
    """Fix timezone-naive datetime values in verification_token_expires"""
    db = SessionLocal()
    try:
        # Get all customers with verification tokens that haven't been verified
        customers = db.query(Customer).filter(
            Customer.email_verified == False,
            Customer.verification_token != None,
            Customer.verification_token_expires != None
        ).all()
        
        print(f"Found {len(customers)} customers with pending verification tokens\n")
        
        updated_count = 0
        already_aware_count = 0
        
        for customer in customers:
            if customer.verification_token_expires:
                # Check if already timezone-aware
                if customer.verification_token_expires.tzinfo is None:
                    # Convert to timezone-aware (assume stored time was meant to be UTC)
                    old_value = customer.verification_token_expires
                    customer.verification_token_expires = customer.verification_token_expires.replace(tzinfo=timezone.utc)
                    print(f"✅ Updated {customer.email}: {old_value} -> {customer.verification_token_expires}")
                    updated_count += 1
                else:
                    already_aware_count += 1
        
        # Commit all changes
        if updated_count > 0:
            db.commit()
            print(f"\n✅ Successfully updated {updated_count} customers")
        
        if already_aware_count > 0:
            print(f"ℹ️  {already_aware_count} customers already had timezone-aware datetimes")
        
        if updated_count == 0 and already_aware_count == 0:
            print("✅ No customers needed updates")
            
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
    
    return True

def check_state():
    """Check current state of customer verification tokens"""
    db = SessionLocal()
    try:
        total_unverified = db.query(Customer).filter(Customer.email_verified == False).count()
        with_tokens = db.query(Customer).filter(
            Customer.email_verified == False,
            Customer.verification_token != None
        ).count()
        
        print(f"\n📊 Current State:")
        print(f"   Total unverified customers: {total_unverified}")
        print(f"   With active tokens: {with_tokens}")
        
        # Check for timezone-naive datetimes
        customers = db.query(Customer).filter(
            Customer.email_verified == False,
            Customer.verification_token != None,
            Customer.verification_token_expires != None
        ).all()
        
        naive_count = 0
        for customer in customers:
            if customer.verification_token_expires and customer.verification_token_expires.tzinfo is None:
                naive_count += 1
        
        print(f"   With timezone-naive datetimes: {naive_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Fix Customer Verification Token Timezones")
    print("=" * 60)
    
    check_state()
    
    print("\n" + "=" * 60)
    print("Starting migration...")
    print("=" * 60 + "\n")
    
    success = fix_customer_tokens()
    
    if success:
        print("\n" + "=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
        check_state()
    else:
        print("\n" + "=" * 60)
        print("Migration failed!")
        print("=" * 60)
        sys.exit(1)
