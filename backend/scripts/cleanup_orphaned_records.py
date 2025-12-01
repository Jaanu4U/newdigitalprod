#!/usr/bin/env python3
"""
Clean up orphaned records in the database.

IMPORTANT: This script PRESERVES historical audit data!
- Keeps assignments that have activity logs (for audit page)
- Keeps all action logs (accepted/started/completed)
- Only removes truly orphaned records (no draft, no activity)

This script removes:
1. Rider assignments WITH NO activity AND no invoice draft (safe to delete)
2. Deliveries table records with no corresponding invoice drafts

Usage:
    cd /opt/digitalchain/backend
    python3 scripts/cleanup_orphaned_records.py [--dry-run]
"""
import sys
import os
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import models
import json

def cleanup_orphaned_records(dry_run=False):
    """Clean up orphaned rider assignments and deliveries."""
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Get all valid invoice IDs from drafts
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.type == 'invoice_draft'
        ).all()
        
        valid_invoice_ids = set()
        for draft in drafts:
            try:
                data = json.loads(draft.payload or '{}')
                invoice_id = data.get('invoice_id')
                if invoice_id:
                    valid_invoice_ids.add(invoice_id)
            except:
                pass
        
        print(f"📊 Found {len(valid_invoice_ids)} valid invoice drafts")
        
        # Get all invoice IDs that have activity (accepted/started/completed)
        # These should be preserved for audit purposes even if invoice_draft was deleted
        activity_logs = db.query(models.SyncLog).filter(
            models.SyncLog.type.in_(['rider_order_accepted', 'rider_delivery_started', 'delivery_completed'])
        ).all()
        
        active_invoice_ids = set()
        for log in activity_logs:
            try:
                data = json.loads(log.payload or '{}')
                invoice_id = data.get('invoice_id')
                if invoice_id:
                    active_invoice_ids.add(invoice_id)
            except:
                pass
        
        print(f"📊 Found {len(active_invoice_ids)} invoices with activity logs (preserved for audit)")
        
        # 1. Clean up orphaned rider assignments (but preserve ones with activity)
        assignments = db.query(models.SyncLog).filter(
            models.SyncLog.type == 'invoice_rider_assigned'
        ).all()
        
        orphaned_assignments = []
        for assignment in assignments:
            try:
                data = json.loads(assignment.payload or '{}')
                invoice_id = data.get('invoice_id')
                # Only orphan if no draft AND no activity
                if invoice_id and invoice_id not in valid_invoice_ids and invoice_id not in active_invoice_ids:
                    orphaned_assignments.append(assignment)
            except:
                pass
        
        print(f"🔍 Found {len(orphaned_assignments)} orphaned rider assignments (no draft, no activity)")
        
        if orphaned_assignments and not dry_run:
            for a in orphaned_assignments:
                db.delete(a)
            db.commit()
            print(f"✅ Deleted {len(orphaned_assignments)} orphaned assignments")
        elif orphaned_assignments:
            print(f"🔄 DRY RUN: Would delete {len(orphaned_assignments)} assignments")
        
        # 1b. DO NOT clean up action logs - keep them for audit history
        # These logs (accepted, started, completed) are needed for the audit trail
        print(f"ℹ️  Preserving {len(active_invoice_ids)} action logs for audit history")
        
        # 2. Clean up orphaned deliveries
        deliveries = db.query(models.Delivery).all()
        
        orphaned_deliveries = []
        for delivery in deliveries:
            if delivery.order_id not in valid_invoice_ids:
                orphaned_deliveries.append(delivery)
        
        print(f"🔍 Found {len(orphaned_deliveries)} orphaned deliveries")
        
        if orphaned_deliveries and not dry_run:
            for d in orphaned_deliveries:
                db.delete(d)
            db.commit()
            print(f"✅ Deleted {len(orphaned_deliveries)} orphaned deliveries")
        elif orphaned_deliveries:
            print(f"🔄 DRY RUN: Would delete {len(orphaned_deliveries)} deliveries")
        
        if not orphaned_assignments and not orphaned_actions and not orphaned_deliveries:
            print("✅ No orphaned records found - database is clean!")
        
    finally:
        db.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Clean up orphaned database records')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be deleted without actually deleting')
    args = parser.parse_args()
    
    if args.dry_run:
        print("🔄 DRY RUN MODE - No changes will be made\n")
    
    cleanup_orphaned_records(dry_run=args.dry_run)
