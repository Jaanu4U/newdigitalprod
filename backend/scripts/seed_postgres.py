"""
Seed script for PostgreSQL database used in production.
Creates test data for rider functionality.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set DATABASE_URL to use PostgreSQL
os.environ['DATABASE_URL'] = 'postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain'

from app.db import get_db
from app.models import Organization, User, SyncLog
from app.security import hash_password
from datetime import datetime, timedelta
import uuid
import json

def seed_postgres_data():
    db = next(get_db())
    
    org_id = "jugesh-logistics"
    
    # 1. Create organization
    existing_org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not existing_org:
        org = Organization(
            org_id=org_id,
            name="Jugesh Logistics",
            plan="Standard",
            status="active",
            access_key=str(uuid.uuid4())
        )
        db.add(org)
        db.commit()
        print("✓ Created organization: Jugesh Logistics")
    else:
        print("→ Organization already exists")
    
    # 2. Create admin user
    admin_email = "admin@jugesh.com"
    existing_admin = db.query(User).filter(
        User.email == admin_email,
        User.org_id == org_id
    ).first()
    
    if not existing_admin:
        admin_user = User(
            user_id=str(uuid.uuid4()),
            org_id=org_id,
            email=admin_email,
            name="Jugesh Admin",
            role="Admin",
            password_hash=hash_password("12345678"),
            status="active"
        )
        db.add(admin_user)
        db.commit()
        print(f"✓ Created admin: {admin_email}")
        admin_user_id = admin_user.user_id
    else:
        admin_user_id = existing_admin.user_id
        print(f"→ Admin already exists: {admin_email}")
    
    # 3. Create rider user with email jugesh.com@gmail.com
    rider_email = "jugesh.com@gmail.com"
    existing_rider = db.query(User).filter(
        User.email == rider_email,
        User.org_id == org_id
    ).first()
    
    if not existing_rider:
        rider_user = User(
            user_id=str(uuid.uuid4()),
            org_id=org_id,
            email=rider_email,
            name="Jugesh Rider",
            role="Rider",
            password_hash=hash_password("12345678"),
            status="active"
        )
        db.add(rider_user)
        db.commit()
        print(f"✓ Created rider: {rider_email}")
        rider_user_id = rider_user.user_id
    else:
        rider_user_id = existing_rider.user_id
        print(f"→ Rider already exists: {rider_email}")
    
    # 4. Create rider1@jugesh.com
    rider1_email = "rider1@jugesh.com"
    existing_rider1 = db.query(User).filter(
        User.email == rider1_email,
        User.org_id == org_id
    ).first()
    
    if not existing_rider1:
        rider1_user = User(
            user_id=str(uuid.uuid4()),
            org_id=org_id,
            email=rider1_email,
            name="Rajesh Kumar",
            role="Rider",
            password_hash=hash_password("12345678"),
            status="active"
        )
        db.add(rider1_user)
        db.commit()
        print(f"✓ Created rider: {rider1_email}")
        rider1_user_id = rider1_user.user_id
    else:
        rider1_user_id = existing_rider1.user_id
        print(f"→ Rider already exists: {rider1_email}")
    
    # 5. Create sample invoices and assignments
    invoices = [
        {
            "invoice_id": "INV-2024-001",
            "customer_name": "ABC Corporation",
            "customer_address": "123 MG Road, Bangalore",
            "customer_phone": "9876543210",
            "amount": 15000.00,
            "rider_user_id": rider_user_id,
            "rider_email": rider_email
        },
        {
            "invoice_id": "INV-2024-002",
            "customer_name": "XYZ Enterprises",
            "customer_address": "456 Brigade Road, Bangalore",
            "customer_phone": "9876543211",
            "amount": 25000.00,
            "rider_user_id": rider_user_id,
            "rider_email": rider_email
        },
        {
            "invoice_id": "INV-2024-003",
            "customer_name": "Tech Solutions Ltd",
            "customer_address": "789 Indiranagar, Bangalore",
            "customer_phone": "9876543212",
            "amount": 18000.00,
            "rider_user_id": rider1_user_id,
            "rider_email": rider1_email
        }
    ]
    
    for inv in invoices:
        # Check if invoice draft exists
        existing_draft = db.query(SyncLog).filter(
            SyncLog.org_id == org_id,
            SyncLog.type == "invoice_draft",
            SyncLog.payload.like(f'%{inv["invoice_id"]}%')
        ).first()
        
        if not existing_draft:
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
                })
            )
            db.add(draft_log)
            print(f"✓ Created invoice draft: {inv['invoice_id']}")
        
        # Check if rider assignment exists
        existing_assignment = db.query(SyncLog).filter(
            SyncLog.org_id == org_id,
            SyncLog.type == "invoice_rider_assigned",
            SyncLog.payload.like(f'%{inv["invoice_id"]}%')
        ).first()
        
        if not existing_assignment:
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
                })
            )
            db.add(assign_log)
            print(f"✓ Assigned {inv['invoice_id']} to {inv['rider_email']}")
    
    db.commit()
    
    print("\n" + "="*60)
    print("✓ PostgreSQL database seeded successfully!")
    print("="*60)
    print(f"\nOrganization: Jugesh Logistics (ID: {org_id})")
    print(f"\nUsers created:")
    print(f"  Admin:  admin@jugesh.com       / 12345678")
    print(f"  Rider:  jugesh.com@gmail.com   / 12345678")
    print(f"  Rider:  rider1@jugesh.com      / 12345678")
    print(f"\nInvoices assigned:")
    print(f"  jugesh.com@gmail.com: INV-2024-001, INV-2024-002")
    print(f"  rider1@jugesh.com:    INV-2024-003")
    print(f"\nTest login:")
    print(f"  Email: jugesh.com@gmail.com")
    print(f"  Password: 12345678")
    print(f"  Org ID: jugesh-logistics")
    print("="*60)

if __name__ == "__main__":
    seed_postgres_data()
