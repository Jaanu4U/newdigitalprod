"""
Seed script to create test data for rider functionality testing.
Uses raw SQL to avoid ORM schema mismatch issues.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.security import hash_password
import sqlite3
from datetime import datetime, timedelta
import uuid
import json

def seed_rider_test_data():
    conn = sqlite3.connect('/opt/digitalchain/backend/digitalchain.db')
    cursor = conn.cursor()
    
    org_id = "jugesh-logistics"
    
    # 1. Create organization
    cursor.execute("SELECT org_id FROM organizations WHERE org_id = ?", (org_id,))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO organizations (org_id, name, plan, status, access_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (org_id, "Jugesh Logistics", "Standard", "active", str(uuid.uuid4()), 
              datetime.utcnow(), datetime.utcnow()))
        print("✓ Created organization: Jugesh Logistics")
    
    # 2. Create admin user
    admin_user_id = str(uuid.uuid4())
    cursor.execute("SELECT user_id FROM users WHERE email = ? AND org_id = ?", ("admin@jugesh.com", org_id))
    existing_admin = cursor.fetchone()
    if not existing_admin:
        cursor.execute("""
            INSERT INTO users (user_id, org_id, email, name, role, password_hash, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (admin_user_id, org_id, "admin@jugesh.com", "Jugesh Admin", "Admin", 
              hash_password("12345678"), "active", datetime.utcnow()))
        print("✓ Created admin user: admin@jugesh.com")
    else:
        admin_user_id = existing_admin[0]
        print("→ Admin user already exists: admin@jugesh.com")
    
    # 3. Create rider 1
    rider_user_id = str(uuid.uuid4())
    cursor.execute("SELECT user_id FROM users WHERE email = ? AND org_id = ?", ("rider1@jugesh.com", org_id))
    existing_rider = cursor.fetchone()
    if not existing_rider:
        cursor.execute("""
            INSERT INTO users (user_id, org_id, email, name, role, password_hash, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (rider_user_id, org_id, "rider1@jugesh.com", "Rajesh Kumar", "Rider", 
              hash_password("12345678"), "active", datetime.utcnow()))
        print("✓ Created rider 1: rider1@jugesh.com")
    else:
        rider_user_id = existing_rider[0]
        print("→ Rider 1 already exists: rider1@jugesh.com")
    
    # 4. Create rider 2
    rider2_user_id = str(uuid.uuid4())
    cursor.execute("SELECT user_id FROM users WHERE email = ? AND org_id = ?", ("rider2@jugesh.com", org_id))
    existing_rider2 = cursor.fetchone()
    if not existing_rider2:
        cursor.execute("""
            INSERT INTO users (user_id, org_id, email, name, role, password_hash, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (rider2_user_id, org_id, "rider2@jugesh.com", "Priya Singh", "Rider", 
              hash_password("12345678"), "active", datetime.utcnow()))
        print("✓ Created rider 2: rider2@jugesh.com")
    else:
        rider2_user_id = existing_rider2[0]
        print("→ Rider 2 already exists: rider2@jugesh.com")
    
    # 5. Create invoices and assignments (only if they don't exist)
    invoices = [
        {
            "invoice_id": "INV-2024-001",
            "customer_name": "ABC Corporation",
            "customer_address": "123 MG Road, Bangalore",
            "customer_phone": "9876543210",
            "amount": 15000.00,
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-002",
            "customer_name": "XYZ Enterprises",
            "customer_address": "456 Brigade Road, Bangalore",
            "customer_phone": "9876543211",
            "amount": 25000.00,
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-003",
            "customer_name": "Tech Solutions Ltd",
            "customer_address": "789 Indiranagar, Bangalore",
            "customer_phone": "9876543212",
            "amount": 18000.00,
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-004",
            "customer_name": "Retail Hub",
            "customer_address": "321 Koramangala, Bangalore",
            "customer_phone": "9876543213",
            "amount": 12000.00,
            "rider_user_id": rider2_user_id,
            "rider_email": "rider2@jugesh.com"
        }
    ]
    
    for inv in invoices:
        # Check if invoice draft exists
        cursor.execute("""
            SELECT id FROM sync_log WHERE org_id = ? AND type = 'invoice_draft' AND payload LIKE ?
        """, (org_id, f'%{inv["invoice_id"]}%'))
        
        if not cursor.fetchone():
            # Create invoice draft
            draft_payload = json.dumps({
                "invoice_id": inv["invoice_id"],
                "customer_name": inv["customer_name"],
                "customer_address": inv["customer_address"],
                "customer_phone": inv["customer_phone"],
                "amount": inv["amount"],
                "items": [
                    {"description": "Delivery Service", "quantity": 1, "price": inv["amount"]}
                ]
            })
            
            cursor.execute("""
                INSERT INTO sync_log (org_id, user_id, type, payload, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (org_id, admin_user_id, "invoice_draft", draft_payload, 
                  datetime.utcnow() - timedelta(hours=2)))
            print(f"✓ Created invoice draft: {inv['invoice_id']}")
        
        # Check if rider assignment exists
        cursor.execute("""
            SELECT id FROM sync_log WHERE org_id = ? AND type = 'invoice_rider_assigned' AND payload LIKE ?
        """, (org_id, f'%{inv["invoice_id"]}%'))
        
        if not cursor.fetchone():
            # Assign rider
            assign_payload = json.dumps({
                "invoice_id": inv["invoice_id"],
                "rider_user_id": inv["rider_user_id"],
                "rider_email": inv["rider_email"],
                "assigned_at": datetime.utcnow().isoformat()
            })
            
            cursor.execute("""
                INSERT INTO sync_log (org_id, user_id, type, payload, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (org_id, admin_user_id, "invoice_rider_assigned", assign_payload,
                  datetime.utcnow() - timedelta(hours=1)))
            print(f"✓ Assigned {inv['invoice_id']} to {inv['rider_email']}")
    
    conn.commit()
    conn.close()
    
    print("\n" + "="*60)
    print("✓ Seed data created successfully!")
    print("="*60)
    print(f"\nOrganization: Jugesh Logistics (ID: {org_id})")
    print(f"\nUsers:")
    print(f"  Admin:   admin@jugesh.com   / 12345678")
    print(f"  Rider 1: rider1@jugesh.com  / 12345678 ({rider_user_id})")
    print(f"  Rider 2: rider2@jugesh.com  / 12345678 ({rider2_user_id})")
    print(f"\nInvoices assigned:")
    print(f"  Rider 1: INV-2024-001, INV-2024-002, INV-2024-003 (3 orders)")
    print(f"  Rider 2: INV-2024-004 (1 order)")
    print(f"\nTest the rider dashboard:")
    print(f"  1. Go to the login page")
    print(f"  2. Login with: rider1@jugesh.com / 12345678")
    print(f"  3. You should be redirected to /rider/dashboard")
    print(f"  4. Dashboard should show 3 assigned orders")
    print("="*60)

if __name__ == "__main__":
    seed_rider_test_data()
