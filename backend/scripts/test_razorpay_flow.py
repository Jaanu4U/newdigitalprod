#!/usr/bin/env python3
"""
Razorpay Payment Flow Test Script

Tests the complete payment flow:
1. Create payment QR
2. Check payment status
3. Simulate webhook callback
4. Verify payment confirmation
"""

import sys
import os
sys.path.insert(0, '/opt/digitalchain/backend')

import json
import hmac
import hashlib
import requests
from datetime import datetime
from app.db import SessionLocal
from app.models import Organization, Payment, Delivery

# Configuration
BASE_URL = "https://api.digitalchain.in/v1"
ADMIN_EMAIL = "swetha.chirras@gmail.com"  # Update with your admin email
ADMIN_PASSWORD = "yourpassword"  # Update with your password

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠️  {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.END}")

def get_auth_token():
    """Login and get JWT token"""
    print_info("Logging in...")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
    )
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        print_success(f"Logged in successfully")
        return token
    else:
        print_error(f"Login failed: {response.text}")
        return None

def check_razorpay_config():
    """Check if Razorpay is configured"""
    print_info("Checking Razorpay configuration...")
    
    db = SessionLocal()
    org = db.query(Organization).first()
    
    if not org:
        print_error("No organization found")
        db.close()
        return None
    
    settings = org.settings or {}
    payment = settings.get('payment', {})
    gateway = payment.get('gateway', {})
    
    print(f"\nOrganization: {org.name} ({org.org_id})")
    print(f"Payment Enabled: {payment.get('enabled', False)}")
    print(f"Gateway Provider: {gateway.get('provider', 'Not set')}")
    print(f"Gateway Enabled: {gateway.get('enabled', False)}")
    print(f"Key ID: {gateway.get('key_id', 'Not set')}")
    print(f"Has Secret: {'Yes' if gateway.get('key_secret') else 'No'}")
    print(f"Has Webhook Secret: {'Yes' if gateway.get('webhook_secret') else 'No'}")
    
    if not gateway.get('enabled'):
        print_warning("Razorpay gateway is not enabled!")
        db.close()
        return None
    
    if not gateway.get('key_id') or not gateway.get('key_secret'):
        print_error("Razorpay credentials not configured!")
        db.close()
        return None
    
    print_success("Razorpay configuration looks good")
    
    config = {
        'org_id': org.org_id,
        'key_id': gateway.get('key_id'),
        'key_secret': gateway.get('key_secret'),
        'webhook_secret': gateway.get('webhook_secret')
    }
    
    db.close()
    return config

def find_test_delivery(token):
    """Find a delivery for testing"""
    print_info("Finding a test delivery...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get recent deliveries
    response = requests.get(
        f"{BASE_URL}/admin/orders/audit",
        headers=headers,
        params={
            "from_date": datetime.now().strftime("%Y-%m-%d"),
            "to_date": datetime.now().strftime("%Y-%m-%d")
        }
    )
    
    if response.status_code == 200:
        deliveries = response.json()
        if deliveries and len(deliveries) > 0:
            delivery = deliveries[0]
            print_success(f"Found delivery: {delivery['invoice_no']}")
            return delivery['invoice_id']
    
    print_warning("No deliveries found, you'll need a delivery ID to test")
    return None

def test_qr_generation(token, delivery_id, amount=100.0):
    """Test QR code generation"""
    print_info(f"Testing QR generation for ₹{amount}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.post(
        f"{BASE_URL}/payment/generate-qr",
        headers=headers,
        json={
            "delivery_id": delivery_id,
            "amount": amount,
            "customer_phone": "9999999999",
            "notes": "Test payment"
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        print_success("QR code generated successfully!")
        print(f"  Payment ID: {data['payment_id']}")
        print(f"  Gateway Order ID: {data.get('gateway_order_id', 'N/A')}")
        print(f"  Amount: ₹{data['amount']}")
        print(f"  Status: {data['status']}")
        print(f"  Expires in: {data['expires_in_seconds']}s")
        return data
    else:
        print_error(f"QR generation failed: {response.text}")
        return None

def check_payment_status(token, payment_id):
    """Check payment status"""
    print_info(f"Checking payment status...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BASE_URL}/payment/{payment_id}/status",
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        print_success(f"Payment status: {data['status']}")
        return data
    else:
        print_error(f"Status check failed: {response.text}")
        return None

def simulate_webhook(config, gateway_order_id, gateway_payment_id="pay_test_123"):
    """Simulate Razorpay webhook callback"""
    print_info("Simulating Razorpay webhook...")
    
    # Create webhook payload (Razorpay format)
    payload = {
        "entity": "event",
        "account_id": "acc_test",
        "event": "payment.captured",
        "contains": ["payment"],
        "payload": {
            "payment": {
                "entity": {
                    "id": gateway_payment_id,
                    "entity": "payment",
                    "amount": 10000,  # 100 rupees in paise
                    "currency": "INR",
                    "status": "captured",
                    "order_id": gateway_order_id,
                    "method": "upi",
                    "captured": True,
                    "created_at": int(datetime.now().timestamp())
                }
            }
        },
        "created_at": int(datetime.now().timestamp())
    }
    
    payload_json = json.dumps(payload)
    payload_bytes = payload_json.encode('utf-8')
    
    # Generate signature if webhook secret is configured
    signature = None
    if config.get('webhook_secret'):
        signature = hmac.new(
            config['webhook_secret'].encode('utf-8'),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()
        print_info(f"Generated signature: {signature[:20]}...")
    else:
        print_warning("No webhook secret configured, signature verification will be skipped")
    
    # Send webhook
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Razorpay-Signature"] = signature
    
    response = requests.post(
        f"{BASE_URL}/payment/webhook/razorpay",
        headers=headers,
        data=payload_bytes
    )
    
    if response.status_code == 200:
        print_success("Webhook processed successfully!")
        return True
    else:
        print_error(f"Webhook failed: {response.status_code} - {response.text}")
        return False

def manual_confirm(token, payment_id):
    """Manually confirm payment"""
    print_info("Manually confirming payment...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.post(
        f"{BASE_URL}/payment/{payment_id}/confirm",
        headers=headers,
        json={
            "upi_transaction_id": "TEST123456789",
            "payment_method": "UPI",
            "notes": "Manual test confirmation"
        }
    )
    
    if response.status_code == 200:
        print_success("Payment confirmed manually!")
        return True
    else:
        print_error(f"Manual confirmation failed: {response.text}")
        return False

def main():
    print("\n" + "="*60)
    print("🧪 Razorpay Payment Flow Test")
    print("="*60 + "\n")
    
    # Step 1: Check Razorpay configuration
    config = check_razorpay_config()
    if not config:
        print_error("Razorpay not configured properly. Exiting.")
        return
    
    print("\n" + "-"*60 + "\n")
    
    # Step 2: Login
    token = get_auth_token()
    if not token:
        print_error("Authentication failed. Exiting.")
        return
    
    print("\n" + "-"*60 + "\n")
    
    # Step 3: Find or create test delivery
    delivery_id = find_test_delivery(token)
    if not delivery_id:
        print_warning("Please provide a delivery_id to test")
        delivery_id = input("Enter delivery_id (or press Enter to skip): ").strip()
        if not delivery_id:
            print_error("No delivery ID provided. Exiting.")
            return
    
    print("\n" + "-"*60 + "\n")
    
    # Step 4: Generate QR
    payment_data = test_qr_generation(token, delivery_id, amount=100.0)
    if not payment_data:
        print_error("QR generation failed. Exiting.")
        return
    
    payment_id = payment_data['payment_id']
    gateway_order_id = payment_data.get('gateway_order_id')
    
    print("\n" + "-"*60 + "\n")
    
    # Step 5: Check initial status
    check_payment_status(token, payment_id)
    
    print("\n" + "-"*60 + "\n")
    
    # Step 6: Simulate payment
    if gateway_order_id:
        print_info("Gateway order created. You can:")
        print("  1. Make real payment via Razorpay dashboard")
        print("  2. Simulate webhook (test only)")
        print("  3. Manually confirm payment")
        
        choice = input("\nEnter choice (1/2/3) or press Enter to skip: ").strip()
        
        if choice == "2":
            if simulate_webhook(config, gateway_order_id):
                print("\n" + "-"*60 + "\n")
                check_payment_status(token, payment_id)
        elif choice == "3":
            manual_confirm(token, payment_id)
            print("\n" + "-"*60 + "\n")
            check_payment_status(token, payment_id)
    else:
        print_warning("No gateway order created (gateway might not be enabled)")
        print_info("Trying manual confirmation...")
        manual_confirm(token, payment_id)
        print("\n" + "-"*60 + "\n")
        check_payment_status(token, payment_id)
    
    print("\n" + "="*60)
    print("✅ Test Complete!")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print_error(f"Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
