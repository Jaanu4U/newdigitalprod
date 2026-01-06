#!/usr/bin/env python3
"""
Fix timezone-aware datetime for existing users with verification tokens
This script updates old users who have timezone-naive datetime values in token_expires_at
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from app.core import settings
from app.models import User
from app.db import SessionLocal

def fix_timezone_aware_tokens():
    """Fix timezone-naive datetime values in token_expires_at for all users"""
    db = SessionLocal()
    try:
        # Get all users with verification tokens that haven't been verified
        users_with_tokens = db.query(User).filter(
            User.email_verified == False,
            User.verification_token != None,
            User.token_expires_at != None
        ).all()
        
        print(f"Found {len(users_with_tokens)} users with pending verification tokens")
        
        updated_count = 0
        already_aware_count = 0
        
        for user in users_with_tokens:
            if user.token_expires_at:
                # Check if already timezone-aware
                if user.token_expires_at.tzinfo is None:
                    # Convert to timezone-aware
                    # Assume the stored time was meant to be UTC
                    old_value = user.token_expires_at
                    user.token_expires_at = user.token_expires_at.replace(tzinfo=timezone.utc)
                    print(f"Updated user {user.email}: {old_value} -> {user.token_expires_at}")
                    updated_count += 1
                else:
                    already_aware_count += 1
        
        # Commit all changes
        if updated_count > 0:
            db.commit()
            print(f"\n✅ Successfully updated {updated_count} users")
        
        if already_aware_count > 0:
            print(f"ℹ️  {already_aware_count} users already had timezone-aware datetimes")
        
        if updated_count == 0 and already_aware_count == 0:
            print("✅ No users needed updates")
            
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
    
    return True

def check_current_state():
    """Check current state of verification tokens"""
    db = SessionLocal()
    try:
        total_unverified = db.query(User).filter(User.email_verified == False).count()
        with_tokens = db.query(User).filter(
            User.email_verified == False,
            User.verification_token != None
        ).count()
        
        print(f"\n📊 Current State:")
        print(f"   Total unverified users: {total_unverified}")
        print(f"   With active tokens: {with_tokens}")
        
        # Check for timezone-naive datetimes
        users = db.query(User).filter(
            User.email_verified == False,
            User.verification_token != None,
            User.token_expires_at != None
        ).all()
        
        naive_count = 0
        for user in users:
            if user.token_expires_at and user.token_expires_at.tzinfo is None:
                naive_count += 1
        
        print(f"   With timezone-naive datetimes: {naive_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Fix Timezone-Aware Verification Tokens")
    print("=" * 60)
    
    # Show current state
    check_current_state()
    
    print("\n" + "=" * 60)
    print("Starting migration...")
    print("=" * 60 + "\n")
    
    # Fix tokens
    success = fix_timezone_aware_tokens()
    
    if success:
        print("\n" + "=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
        
        # Show updated state
        check_current_state()
    else:
        print("\n" + "=" * 60)
        print("Migration failed!")
        print("=" * 60)
        sys.exit(1)
