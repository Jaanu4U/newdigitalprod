#!/usr/bin/env python3
"""Test rider location broadcasting via WebSocket"""

import asyncio
import websockets
import requests
import json

async def listen_to_websocket(token, org_id):
    """Listen for WebSocket messages"""
    uri = f"wss://api.digitalchain.in/ws?token={token}"
    print(f"🔌 Connecting to WebSocket...")
    
    try:
        import ssl
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        async with websockets.connect(uri, ssl=ssl_context) as websocket:
            print("✅ WebSocket connected! Listening for rider location updates...")
            print("   (Will listen for 60 seconds)")
            
            try:
                while True:
                    message = await asyncio.wait_for(websocket.recv(), timeout=60.0)
                    data = json.loads(message)
                    
                    if data.get('type') == 'rider_location_update':
                        rider_data = data.get('data', {})
                        print(f"\n📍 RIDER LOCATION UPDATE:")
                        print(f"   Rider: {rider_data.get('rider_name')} ({rider_data.get('rider_email')})")
                        print(f"   Location: {rider_data.get('latitude')}, {rider_data.get('longitude')}")
                        print(f"   Invoice: {rider_data.get('invoice_no')}")
                        print(f"   Timestamp: {rider_data.get('timestamp')}")
                    else:
                        print(f"\n📨 Message: {data.get('type')}")
                        
            except asyncio.TimeoutError:
                print("\n⏱️ No messages received in 60 seconds")
                
    except Exception as e:
        print(f"❌ WebSocket error: {e}")

def main():
    # Login as admin
    print("🔐 Logging in as admin...")
    response = requests.post(
        'https://api.digitalchain.in/v1/auth/login',
        json={'email': 'jugeshr@gmail.com', 'password': '12345678'},
        headers={'X-Org': 'jugesh'},
        verify=False
    )
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        return
    
    data = response.json()
    token = data['access_token']
    org_id = data['org_id']
    
    print(f"✅ Logged in as admin (org_id: {org_id})")
    print("\nNow send a location update from the rider Android app to see it broadcast here!")
    
    # Listen to WebSocket
    asyncio.run(listen_to_websocket(token, org_id))

if __name__ == "__main__":
    import warnings
    warnings.filterwarnings('ignore', message='Unverified HTTPS request')
    main()
