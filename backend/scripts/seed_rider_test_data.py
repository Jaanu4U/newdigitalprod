"""
Seed script to create test data for rider functionality testing.
Creates an organization, users (including riders), invoices, and rider assignments.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import get_db
from app.models import SyncLog
from app.security import hash_password
import json
from datetime import datetime, timedelta
import uuid

def seed_rider_test_data():
    db = next(get_db())
    
    # Organization ID
    org_id = "jugesh-logistics"
    
    # 1. Create organization in both Organization table and SyncLog
    from app.models import Organization, User
    
    # Check if org exists
    existing_org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not existing_org:
        org = Organization(
            org_id=org_id,
            name="Jugesh Logistics",
            plan="Standard",
            status="active",
            access_key=str(uuid.uuid4()),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(org)
        
        org_log = SyncLog(
            org_id=org_id,
            user_id="system",
            type="org_onboard",
            payload=json.dumps({
                "org_name": "Jugesh Logistics",
                "admin_email": "admin@jugesh.com",
                "admin_name": "Jugesh Admin",
                "plan": "Standard"
            }),
            created_at=datetime.utcnow()
        )
        db.add(org_log)
    
    # 2. Create admin user
    admin_user_id = str(uuid.uuid4())
    existing_admin = db.query(User).filter(User.email == "admin@jugesh.com", User.org_id == org_id).first()
    if not existing_admin:
        admin_user = User(
            user_id=admin_user_id,
            org_id=org_id,
            email="admin@jugesh.com",
            name="Jugesh Admin",
            role="Admin",
            password_hash=hash_password("12345678"),
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(admin_user)
        
        admin_log = SyncLog(
            org_id=org_id,
            user_id="system",
            type="user_created",
            payload=json.dumps({
                "user_id": admin_user_id,
                "email": "admin@jugesh.com",
                "full_name": "Jugesh Admin",
                "role": "Admin",
                "password_hash": hash_password("12345678"),
                "status": "active"
            }),
            created_at=datetime.utcnow()
        )
        db.add(admin_log)
    else:
        admin_user_id = existing_admin.user_id
    
    # 3. Create rider user
    rider_user_id = str(uuid.uuid4())
    existing_rider = db.query(User).filter(User.email == "rider1@jugesh.com", User.org_id == org_id).first()
    if not existing_rider:
        rider_user = User(
            user_id=rider_user_id,
            org_id=org_id,
            email="rider1@jugesh.com",
            name="Rajesh Kumar",
            role="Rider",
            password_hash=hash_password("12345678"),
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(rider_user)
        
        rider_log = SyncLog(
            org_id=org_id,
            user_id=admin_user_id,
            type="user_created",
            payload=json.dumps({
                "user_id": rider_user_id,
                "email": "rider1@jugesh.com",
                "full_name": "Rajesh Kumar",
                "role": "Rider",
                "password_hash": hash_password("12345678"),
                "status": "active"
            }),
            created_at=datetime.utcnow()
        )
        db.add(rider_log)
    else:
        rider_user_id = existing_rider.user_id
    
    # 4. Create second rider
    rider2_user_id = str(uuid.uuid4())
    existing_rider2 = db.query(User).filter(User.email == "rider2@jugesh.com", User.org_id == org_id).first()
    if not existing_rider2:
        rider2_user = User(
            user_id=rider2_user_id,
            org_id=org_id,
            email="rider2@jugesh.com",
            name="Priya Singh",
            role="Rider",
            password_hash=hash_password("12345678"),
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(rider2_user)
        
        rider2_log = SyncLog(
            org_id=org_id,
            user_id=admin_user_id,
            type="user_created",
            payload=json.dumps({
                "user_id": rider2_user_id,
                "email": "rider2@jugesh.com",
                "full_name": "Priya Singh",
                "role": "Rider",
                "password_hash": hash_password("12345678"),
                "status": "active"
            }),
            created_at=datetime.utcnow()
        )
        db.add(rider2_log)
    else:
        rider2_user_id = existing_rider2.user_id
    
    # 5. Create some invoices and assign to riders
    invoices = [
        {
            "invoice_id": "INV-2024-001",
            "customer_name": "ABC Corporation",
            "customer_address": "123 MG Road, Bangalore",
            "customer_phone": "9876543210",
            "amount": 15000.00,
            "status": "pending",
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-002",
            "customer_name": "XYZ Enterprises",
            "customer_address": "456 Brigade Road, Bangalore",
            "customer_phone": "9876543211",
            "amount": 25000.00,
            "status": "pending",
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-003",
            "customer_name": "Tech Solutions Ltd",
            "customer_address": "789 Indiranagar, Bangalore",
            "customer_phone": "9876543212",
            "amount": 18000.00,
            "status": "pending",
            "rider_user_id": rider_user_id,
            "rider_email": "rider1@jugesh.com"
        },
        {
            "invoice_id": "INV-2024-004",
            "customer_name": "Retail Hub",
            "customer_address": "321 Koramangala, Bangalore",
            "customer_phone": "9876543213",
            "amount": 12000.00,
            "status": "pending",
            "rider_user_id": rider2_user_id,
            "rider_email": "rider2@jugesh.com"
        }
    ]
    
    for inv in invoices:
        # Create invoice draft
        draft_log = SyncLog(
            org_id=org_id,
            user_id=admin_user_id,
            type="invoice_draft",
            payload=json.dumps({
                "invoice_id": inv["invoice_id"],
                "customer_name": inv["customer_name"],
                "customer_address": inv["customer_address"],
                "customer_phone": inv["customer_phone"],
                "amount": inv["amount"],
                "items": [
                    {"description": "Delivery Service", "quantity": 1, "price": inv["amount"]}
                ]
            }),
            created_at=datetime.utcnow() - timedelta(hours=2)
        )
        db.add(draft_log)
        
        # Assign rider
        assign_log = SyncLog(
            org_id=org_id,
            user_id=admin_user_id,
            type="invoice_rider_assigned",
            payload=json.dumps({
                "invoice_id": inv["invoice_id"],
                "rider_user_id": inv["rider_user_id"],
                "rider_email": inv["rider_email"],
                "assigned_at": datetime.utcnow().isoformat()
            }),
            created_at=datetime.utcnow() - timedelta(hours=1)
        )
        db.add(assign_log)
    
    db.commit()
    print("✓ Seeded test data successfully!")
    print(f"\nOrganization: Jugesh Logistics (ID: {org_id})")
    print(f"\nUsers created:")
    print(f"  Admin: admin@jugesh.com / 12345678")
    print(f"  Rider 1: rider1@jugesh.com / 12345678 ({rider_user_id})")
    print(f"  Rider 2: rider2@jugesh.com / 12345678 ({rider2_user_id})")
    print(f"\nInvoices created and assigned:")
    print(f"  Rider 1 (rider1@jugesh.com) has 3 invoices: INV-2024-001, INV-2024-002, INV-2024-003")
    print(f"  Rider 2 (rider2@jugesh.com) has 1 invoice: INV-2024-004")
    print("\nYou can now test the rider dashboard by logging in with rider1@jugesh.com / 12345678")

if __name__ == "__main__":
    seed_rider_test_data()
