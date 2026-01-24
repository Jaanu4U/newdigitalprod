#!/usr/bin/env python3
"""
Migration script to add route_sequence column to deliveries table
"""
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db import engine
from sqlalchemy import text

def migrate():
    """Add route_sequence column to deliveries table"""
    print("Adding route_sequence column to deliveries table...")
    
    with engine.connect() as conn:
        try:
            # Check if column already exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='deliveries' AND column_name='route_sequence'
            """))
            
            if result.fetchone():
                print("✓ route_sequence column already exists")
                return
            
            # Add the column
            conn.execute(text("""
                ALTER TABLE deliveries 
                ADD COLUMN route_sequence INTEGER
            """))
            conn.commit()
            
            print("✓ Successfully added route_sequence column")
            print("✓ Migration complete!")
            
        except Exception as e:
            print(f"✗ Migration failed: {e}")
            raise

if __name__ == "__main__":
    migrate()
