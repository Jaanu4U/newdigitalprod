#!/usr/bin/env python3
"""
Migration script to update invoice item fields from name/quantity/price to description/qty/rate
"""
import psycopg2
import json
from datetime import datetime

# Database connection
conn = psycopg2.connect(
    host="127.0.0.1",
    database="digitalchain",
    user="dcuser",
    password="DigitalChain2024Prod"
)

cur = conn.cursor()

# Get all invoice_draft records with items
cur.execute("""
    SELECT id, payload 
    FROM sync_log 
    WHERE type='invoice_draft' 
    AND payload::json->'items' IS NOT NULL
""")

rows = cur.fetchall()
print(f"Found {len(rows)} invoices to process")

updated_count = 0
error_count = 0

for row_id, payload_str in rows:
    try:
        payload = json.loads(payload_str)
        
        if 'items' not in payload or not payload['items']:
            continue
        
        # Check if items need migration (have 'name' field instead of 'description')
        needs_migration = False
        for item in payload['items']:
            if 'name' in item and 'description' not in item:
                needs_migration = True
                break
        
        if not needs_migration:
            continue
        
        # Migrate items
        for item in payload['items']:
            if 'name' in item:
                item['description'] = item.pop('name')
            if 'quantity' in item:
                item['qty'] = item.pop('quantity')
            if 'price' in item:
                item['rate'] = item.pop('price')
        
        # Update the record
        updated_payload = json.dumps(payload)
        cur.execute("""
            UPDATE sync_log 
            SET payload = %s 
            WHERE id = %s
        """, (updated_payload, row_id))
        
        updated_count += 1
        
    except Exception as e:
        print(f"Error processing record {row_id}: {e}")
        error_count += 1

conn.commit()
cur.close()
conn.close()

print(f"\nMigration complete!")
print(f"Updated: {updated_count}")
print(f"Errors: {error_count}")
print(f"Skipped (already migrated): {len(rows) - updated_count - error_count}")
