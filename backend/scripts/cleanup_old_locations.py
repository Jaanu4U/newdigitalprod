#!/usr/bin/env python3
"""
Cleanup old rider location updates from the database.
Runs every 15 minutes via systemd timer.
Keeps only the last 30 days of location data.
"""

import sys
import os
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import get_db
from app import models
from sqlalchemy import func

def cleanup_old_locations(days_to_keep=30):
    """Delete location updates older than specified days"""
    db = next(get_db())
    
    try:
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        
        # Count before deletion
        total_count = db.query(func.count(models.SyncLog.id)).filter(
            models.SyncLog.type == 'rider_location_update'
        ).scalar()
        
        old_count = db.query(func.count(models.SyncLog.id)).filter(
            models.SyncLog.type == 'rider_location_update',
            models.SyncLog.created_at < cutoff_date
        ).scalar()
        
        if old_count == 0:
            print(f"[{datetime.now().isoformat()}] No old location updates to delete")
            print(f"Total location updates: {total_count}")
            return
        
        # Delete old location updates
        deleted_count = db.query(models.SyncLog).filter(
            models.SyncLog.type == 'rider_location_update',
            models.SyncLog.created_at < cutoff_date
        ).delete(synchronize_session=False)
        
        db.commit()
        
        remaining_count = db.query(func.count(models.SyncLog.id)).filter(
            models.SyncLog.type == 'rider_location_update'
        ).scalar()
        
        print(f"[{datetime.now().isoformat()}] Cleanup completed:")
        print(f"  - Deleted: {deleted_count} location updates older than {days_to_keep} days")
        print(f"  - Remaining: {remaining_count} location updates")
        print(f"  - Cutoff date: {cutoff_date.isoformat()}")
        
    except Exception as e:
        db.rollback()
        print(f"[{datetime.now().isoformat()}] ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    # Default: keep 30 days, can be overridden via command line
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    cleanup_old_locations(days)
