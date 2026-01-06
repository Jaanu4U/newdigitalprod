#!/usr/bin/env python3
"""
Add password reset fields to customers table
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.db import engine

def migrate():
    """Add password_reset_token and password_reset_expires columns"""
    with engine.connect() as conn:
        try:
            # Check if columns already exist
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='customers' 
                AND column_name IN ('password_reset_token', 'password_reset_expires')
            """))
            existing = [row[0] for row in result]
            
            if 'password_reset_token' in existing and 'password_reset_expires' in existing:
                print("✅ Columns already exist, no migration needed")
                return True
            
            # Add password_reset_token if not exists
            if 'password_reset_token' not in existing:
                print("Adding password_reset_token column...")
                conn.execute(text("""
                    ALTER TABLE customers 
                    ADD COLUMN password_reset_token VARCHAR
                """))
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_customers_password_reset_token 
                    ON customers(password_reset_token)
                """))
                conn.commit()
                print("✅ Added password_reset_token column")
            
            # Add password_reset_expires if not exists
            if 'password_reset_expires' not in existing:
                print("Adding password_reset_expires column...")
                conn.execute(text("""
                    ALTER TABLE customers 
                    ADD COLUMN password_reset_expires TIMESTAMP
                """))
                conn.commit()
                print("✅ Added password_reset_expires column")
            
            print("\n✅ Migration completed successfully!")
            return True
            
        except Exception as e:
            conn.rollback()
            print(f"❌ Migration failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    print("="*60)
    print("Customer Password Reset Migration")
    print("="*60)
    print()
    
    success = migrate()
    
    if not success:
        sys.exit(1)
