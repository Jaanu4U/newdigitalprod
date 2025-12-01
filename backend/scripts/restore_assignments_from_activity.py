#!/usr/bin/env python3
"""
Restore invoice_rider_assigned records from activity logs (accepted/started/completed).

This is needed when assignments were deleted but we still have activity logs
and need to show them in the audit page.

Usage:
    cd /opt/digitalchain/backend
    python3 scripts/restore_assignments_from_activity.py [--dry-run]
"""
import sys
import os
import argparse
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import models
import json

def restore_assignments_from_activity(dry_run=False):
    """Restore missing assignment records from activity logs."""
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Get all existing assignments
        existing_assignments = db.query(models.SyncLog).filter(
            models.SyncLog.type == 'invoice_rider_assigned'
        ).all()
        
        existing_invoice_ids = set()
        for assignment in existing_assignments:
            try:
                data = json.loads(assignment.payload or '{}')
                invoice_id = data.get('invoice_id')
                if invoice_id:
                    existing_invoice_ids.add(invoice_id)
            except:
                pass
        
        print(f"📊 Found {len(existing_invoice_ids)} existing assignment records")
        
        # Get all activity logs
        activity_logs = db.query(models.SyncLog).filter(
            models.SyncLog.type.in_(['rider_order_accepted', 'rider_delivery_started', 'delivery_completed'])
        ).order_by(models.SyncLog.created_at).all()
        
        print(f"📊 Found {len(activity_logs)} activity logs")
        
        # Build map of invoice_id -> (rider_user_id, earliest_timestamp, org_id, customer_id)
        missing_assignments = {}
        
        for log in activity_logs:
            try:
                data = json.loads(log.payload or '{}')
                invoice_id = data.get('invoice_id')
                rider_user_id = data.get('rider_user_id')
                
                if not invoice_id or not rider_user_id:
                    continue
                
                # Skip if assignment already exists
                if invoice_id in existing_invoice_ids:
                    continue
                
                # Record this as a missing assignment (use earliest timestamp)
                if invoice_id not in missing_assignments:
                    missing_assignments[invoice_id] = {
                        'rider_user_id': rider_user_id,
                        'created_at': log.created_at,
                        'org_id': log.org_id,
                        'customer_id': data.get('customer_id'),
                        'user_id': log.user_id  # Who created the log
                    }
                else:
                    # Use earliest timestamp
                    if log.created_at < missing_assignments[invoice_id]['created_at']:
                        missing_assignments[invoice_id]['created_at'] = log.created_at
            except:
                pass
        
        print(f"🔍 Found {len(missing_assignments)} missing assignment records")
        
        if not missing_assignments:
            print("✅ No missing assignments to restore")
            return
        
        # Show sample
        print("\nSample missing assignments:")
        for i, (invoice_id, info) in enumerate(list(missing_assignments.items())[:5], 1):
            print(f"  {i}. Invoice: {invoice_id}")
            print(f"     Rider: {info['rider_user_id']}")
            print(f"     Created: {info['created_at']}")
        
        if len(missing_assignments) > 5:
            print(f"  ... and {len(missing_assignments) - 5} more")
        
        if dry_run:
            print(f"\n🔄 DRY RUN: Would restore {len(missing_assignments)} assignments")
            return
        
        # Create missing assignment records
        restored_count = 0
        for invoice_id, info in missing_assignments.items():
            try:
                assignment_log = models.SyncLog(
                    org_id=info['org_id'],
                    type='invoice_rider_assigned',
                    payload=json.dumps({
                        'invoice_id': invoice_id,
                        'rider_user_id': info['rider_user_id'],
                        'customer_id': info.get('customer_id'),
                        'assigned_at': info['created_at'].isoformat() + 'Z',
                        'restored': True,  # Mark as restored
                        'restored_at': datetime.utcnow().isoformat() + 'Z'
                    }),
                    user_id=info.get('user_id'),
                    created_at=info['created_at']  # Use original timestamp
                )
                db.add(assignment_log)
                restored_count += 1
            except Exception as e:
                print(f"Error restoring assignment for {invoice_id}: {e}")
        
        db.commit()
        print(f"✅ Restored {restored_count} assignment records from activity logs")
        
    finally:
        db.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Restore assignment records from activity logs')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be restored without actually restoring')
    args = parser.parse_args()
    
    if args.dry_run:
        print("🔄 DRY RUN MODE - No changes will be made\n")
    
    restore_assignments_from_activity(dry_run=args.dry_run)
