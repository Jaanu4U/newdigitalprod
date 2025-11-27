#!/usr/bin/env python3
"""
Add shipment providers to the database.
Run as SuperAdmin with valid token.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app import models
import uuid

providers_data = [
    # Indian Couriers
    {
        "name": "India Post",
        "code": "INDIAPOST",
        "tracking_url": "https://www.indiapost.gov.in/vas/Pages/trackconsignment.aspx",
        "active": True
    },
    {
        "name": "Blue Dart Express",
        "code": "BLUEDART",
        "tracking_url": "https://www.bluedart.com/tracking",
        "active": True
    },
    {
        "name": "DTDC Courier",
        "code": "DTDC",
        "tracking_url": "https://www.dtdc.in/tracking.asp",
        "active": True
    },
    {
        "name": "Delhivery",
        "code": "DELHIVERY",
        "tracking_url": "https://www.delhivery.com/tracking",
        "active": True
    },
    {
        "name": "Ecom Express",
        "code": "ECOMEXPRESS",
        "tracking_url": "https://ecomexpress.in/tracking-details",
        "active": True
    },
    {
        "name": "XpressBees",
        "code": "XPRESSBEES",
        "tracking_url": "https://www.xpressbees.com/track-shipment",
        "active": True
    },
    {
        "name": "Shadowfax",
        "code": "SHADOWFAX",
        "tracking_url": "https://www.shadowfax.in/track",
        "active": True
    },
    {
        "name": "Gati Ltd.",
        "code": "GATI",
        "tracking_url": "https://www.gati.com/tools/track-your-shipment/",
        "active": True
    },
    {
        "name": "Trackon Courier",
        "code": "TRACKON",
        "tracking_url": "https://trackon.in/track/",
        "active": True
    },
    {
        "name": "Professional Couriers",
        "code": "TPC",
        "tracking_url": "https://www.tpcindia.com/Tracking2017.aspx",
        "active": True
    },
    # International Couriers
    {
        "name": "DHL Express",
        "code": "DHL",
        "tracking_url": "https://www.dhl.com/global-en/home/tracking.html",
        "active": True
    },
    {
        "name": "FedEx",
        "code": "FEDEX",
        "tracking_url": "https://www.fedex.com/fedextrack",
        "active": True
    },
    {
        "name": "UPS",
        "code": "UPS",
        "tracking_url": "https://www.ups.com/track",
        "active": True
    },
    {
        "name": "TNT Express",
        "code": "TNT",
        "tracking_url": "https://www.tnt.com/express/en_in/site/tracking.html",
        "active": True
    },
    {
        "name": "Aramex",
        "code": "ARAMEX",
        "tracking_url": "https://www.aramex.com/track/shipments",
        "active": True
    },
    {
        "name": "DPD",
        "code": "DPD",
        "tracking_url": "https://www.dpd.com/tracking",
        "active": True
    },
    {
        "name": "USPS",
        "code": "USPS",
        "tracking_url": "https://tools.usps.com/go/TrackConfirmAction_input",
        "active": True
    },
    {
        "name": "Canada Post",
        "code": "CANADAPOST",
        "tracking_url": "https://www.canadapost-postescanada.ca/track-reperage/en",
        "active": True
    },
    # Additional E-commerce platforms
    {
        "name": "Amazon Shipping",
        "code": "AMAZON",
        "tracking_url": "https://track.amazon.com",
        "active": True
    },
    {
        "name": "Flipkart Logistics",
        "code": "FLIPKART",
        "tracking_url": "https://www.flipkart.com/track",
        "active": True
    },
    {
        "name": "Shiprocket",
        "code": "SHIPROCKET",
        "tracking_url": "https://www.shiprocket.in/shipment-tracking/",
        "active": True
    },
]

def add_providers():
    db = SessionLocal()
    try:
        added = 0
        skipped = 0
        
        for provider_data in providers_data:
            # Check if provider already exists
            existing = db.query(models.ShipmentProvider).filter(
                models.ShipmentProvider.code == provider_data["code"]
            ).first()
            
            if existing:
                print(f"⏭️  Skipped: {provider_data['name']} ({provider_data['code']}) - already exists")
                skipped += 1
                continue
            
            # Create new provider
            provider = models.ShipmentProvider(
                provider_id=str(uuid.uuid4()),
                name=provider_data["name"],
                code=provider_data["code"],
                tracking_url=provider_data["tracking_url"],
                active=provider_data["active"]
            )
            
            db.add(provider)
            print(f"✅ Added: {provider_data['name']} ({provider_data['code']})")
            added += 1
        
        db.commit()
        print(f"\n{'='*60}")
        print(f"✨ Summary: {added} providers added, {skipped} already existed")
        print(f"{'='*60}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Adding shipment providers to database...\n")
    add_providers()
