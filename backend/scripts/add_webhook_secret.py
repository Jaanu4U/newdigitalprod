#!/usr/bin/env python3
"""
Quick script to add Razorpay webhook secret to organization settings
"""

import sys
sys.path.insert(0, '/opt/digitalchain/backend')

from app.db import SessionLocal
from app.models import Organization
import json

def add_webhook_secret():
    """Add webhook secret to Razorpay gateway settings"""
    
    print("\n" + "="*60)
    print("🔐 Add Razorpay Webhook Secret")
    print("="*60 + "\n")
    
    webhook_secret = input("Enter your Razorpay webhook secret: ").strip()
    
    if not webhook_secret:
        print("❌ No webhook secret provided. Exiting.")
        return
    
    db = SessionLocal()
    
    try:
        # Get organization
        org = db.query(Organization).first()
        
        if not org:
            print("❌ No organization found!")
            db.close()
            return
        
        print(f"\nOrganization: {org.name} ({org.org_id})")
        
        # Get current settings
        settings = org.settings or {}
        payment = settings.get('payment', {})
        
        # Check structure
        if 'gateway' in payment:
            # New structure
            payment['gateway']['webhook_secret'] = webhook_secret
            print("✅ Updated webhook_secret in gateway structure")
        else:
            # Old structure - transform to new
            gateway = {
                'provider': 'razorpay',
                'enabled': True,
                'key_id': payment.get('public_key', ''),
                'key_secret': payment.get('secret_key', ''),
                'webhook_secret': webhook_secret
            }
            
            payment = {
                'enabled': payment.get('enabled', True),
                'upi': payment.get('upi', {}),
                'gateway': gateway
            }
            settings['payment'] = payment
            print("✅ Transformed to new structure and added webhook_secret")
        
        # Save
        org.settings = settings
        db.commit()
        
        print("\n" + "-"*60)
        print("✅ Webhook secret saved successfully!")
        print("-"*60)
        
        # Show current config
        print("\nCurrent Gateway Configuration:")
        gateway = settings.get('payment', {}).get('gateway', {})
        print(f"  Provider: {gateway.get('provider', 'Not set')}")
        print(f"  Enabled: {gateway.get('enabled', False)}")
        print(f"  Key ID: {gateway.get('key_id', 'Not set')}")
        print(f"  Has Secret: {'Yes' if gateway.get('key_secret') else 'No'}")
        print(f"  Webhook Secret: {'✅ Configured' if gateway.get('webhook_secret') else 'Not set'}")
        
        print("\n🎉 Auto-confirmation is now enabled!")
        print("\nNext steps:")
        print("1. Set up webhook in Razorpay Dashboard")
        print("2. Webhook URL: https://api.digitalchain.in/v1/payment/webhook/razorpay")
        print("3. Events: payment.captured, payment.failed")
        print("4. Test a payment to verify auto-confirmation works")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
    
    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    add_webhook_secret()
