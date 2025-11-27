#!/usr/bin/env python3
"""
Seed production database with test users - schema-agnostic version.
Run this on the production server.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db import SessionLocal
from app import models
from app.security import hash_password
import uuid

def seed_production():
    db = SessionLocal()
    
    try:
        # Check if jugesh org exists
        org = db.query(models.Organization).filter(models.Organization.slug == "jugesh").first()
        
        if not org:
            print("Creating JugeshOrg...")
            org = models.Organization(
                org_id=str(uuid.uuid4()),
                name="JugeshOrg",
                slug="jugesh",
                custom_domain="jugesh.com",
                region="IN",
                plan="basic",
                status="active",
                access_key="jugesh-access-key-prod"
            )
            db.add(org)
            db.flush()
            print(f"✓ Created org: {org.org_id}")
        else:
            print(f"✓ Org already exists: {org.org_id}")
            # Ensure it's active
            if org.status != "active":
                org.status = "active"
                db.flush()
                print("  → Set org status to active")
        
        # Create/update admin user
        admin_email = "jugeshr@gmail.com"
        admin = db.query(models.User).filter(
            models.User.org_id == org.org_id,
            models.User.email == admin_email
        ).first()
        
        if not admin:
            print(f"Creating admin: {admin_email}...")
            admin = models.User(
                user_id=str(uuid.uuid4()),
                org_id=org.org_id,
                email=admin_email,
                name="Jugesh",
                role="Owner",
                cellnumber="+919876543210",
                password_hash=hash_password("12345678"),
                email_verified=True,
                status="active"
            )
            db.add(admin)
            print(f"✓ Created admin: {admin.user_id}")
        else:
            print(f"✓ Admin exists: {admin.user_id}")
            # Ensure verified
            if not admin.email_verified:
                admin.email_verified = True
                admin.status = "active"
                print("  → Verified and activated admin")
        
        # Create riders
        riders = [
            {"email": "swetha.chirras@gmail.com", "name": "Swetha", "phone": "+919876543220"},
            {"email": "rahul2brk.rk@gmail.com", "name": "Rahul Rider", "phone": "+919876543221"},
        ]
        
        for rider_data in riders:
            rider = db.query(models.User).filter(
                models.User.org_id == org.org_id,
                models.User.email == rider_data["email"]
            ).first()
            
            if not rider:
                print(f"Creating rider: {rider_data['email']}...")
                rider = models.User(
                    user_id=str(uuid.uuid4()),
                    org_id=org.org_id,
                    email=rider_data["email"],
                    name=rider_data["name"],
                    role="Rider",
                    cellnumber=rider_data["phone"],
                    password_hash=hash_password("12345678"),
                    email_verified=True,
                    status="active"
                )
                db.add(rider)
                print(f"✓ Created rider: {rider.user_id}")
            else:
                print(f"✓ Rider exists: {rider.user_id}")
                if not rider.email_verified:
                    rider.email_verified = True
                    rider.status = "active"
                    print("  → Verified and activated rider")
        
        db.commit()
        print("\n✅ Production seeding complete!")
        print(f"   Org: jugesh (ID: {org.org_id})")
        print("   Users ready for Android login")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_production()
