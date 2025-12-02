#!/bin/bash
# Migration script to update invoice item fields using psql

export PGPASSWORD='DigitalChain2024Prod'

echo "Fetching invoices with old item field names..."

psql -h 127.0.0.1 -U dcuser -d digitalchain << 'EOF'
-- Create a temporary function to migrate item fields
CREATE OR REPLACE FUNCTION migrate_invoice_items() RETURNS void AS $$
DECLARE
    rec RECORD;
    payload_obj json;
    updated_payload json;
BEGIN
    FOR rec IN 
        SELECT id, payload::json as payload_data
        FROM sync_log 
        WHERE type='invoice_draft' 
        AND payload::json->'items' IS NOT NULL
    LOOP
        -- Check if migration is needed (has 'name' field in first item)
        IF rec.payload_data->'items'->0 ? 'name' THEN
            -- Update the record with migrated fields
            -- This is a complex transformation, better done in Python
            RAISE NOTICE 'Record % needs migration', rec.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the function
SELECT migrate_invoice_items();

-- Drop the function
DROP FUNCTION migrate_invoice_items();
EOF

echo "Migration check complete"
