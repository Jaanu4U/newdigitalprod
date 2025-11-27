#!/usr/bin/env python3
"""Seed global shipment providers.

Idempotent: skips existing codes. Safe to run multiple times.

Usage:
  python backend/scripts/seed_providers.py
  python backend/scripts/seed_providers.py --only FEDEX,DHL
  python backend/scripts/seed_providers.py --deactivate SHIPROCKET

Environment:
  Relies on backend/app/db.py engine configuration (DATABASE_URL etc).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal  # type: ignore
from app import models  # type: ignore

PROVIDERS = [
    # India Domestic & E-commerce
    {"name": "India Post", "code": "INDIAPOST", "tracking_url": "https://www.indiapost.gov.in/vas/Pages/trackconsignment.aspx"},
    {"name": "Blue Dart", "code": "BLUEDART", "tracking_url": "https://www.bluedart.com/tracking"},
    {"name": "DTDC", "code": "DTDC", "tracking_url": "https://www.dtdc.in/tracking.asp"},
    {"name": "Delhivery", "code": "DELHIVERY", "tracking_url": "https://www.delhivery.com/tracking"},
    {"name": "Ecom Express", "code": "ECOMEXPRESS", "tracking_url": "https://ecomexpress.in/tracking-details"},
    {"name": "XpressBees", "code": "XPRESSBEES", "tracking_url": "https://www.xpressbees.com/track-shipment"},
    {"name": "Shadowfax", "code": "SHADOWFAX", "tracking_url": "https://www.shadowfax.in/track"},
    {"name": "Gati", "code": "GATI", "tracking_url": "https://www.gati.com/tools/track-your-shipment/"},
    {"name": "Trackon", "code": "TRACKON", "tracking_url": "https://trackon.in/track/"},
    {"name": "Professional Couriers", "code": "TPC", "tracking_url": "https://www.tpcindia.com/Tracking2017.aspx"},
    # Global / International
    {"name": "DHL Express", "code": "DHL", "tracking_url": "https://www.dhl.com/global-en/home/tracking.html"},
    {"name": "FedEx", "code": "FEDEX", "tracking_url": "https://www.fedex.com/fedextrack/"},
    {"name": "UPS", "code": "UPS", "tracking_url": "https://www.ups.com/track"},
    {"name": "USPS", "code": "USPS", "tracking_url": "https://tools.usps.com/go/TrackConfirmAction_input"},
    {"name": "TNT Express", "code": "TNT", "tracking_url": "https://www.tnt.com/express/en_in/site/tracking.html"},
    {"name": "Aramex", "code": "ARAMEX", "tracking_url": "https://www.aramex.com/track/shipments"},
    {"name": "DPD", "code": "DPD", "tracking_url": "https://www.dpd.com/tracking"},
    {"name": "Canada Post", "code": "CANADAPOST", "tracking_url": "https://www.canadapost-postescanada.ca/track-reperage/en"},
    # Aggregators / Marketplaces
    {"name": "Shiprocket", "code": "SHIPROCKET", "tracking_url": "https://www.shiprocket.in/track/"},
    {"name": "Amazon Shipping", "code": "AMAZON", "tracking_url": "https://track.amazon.in/"},
    {"name": "Flipkart Logistics", "code": "FLIPKART", "tracking_url": "https://www.flipkart.com/helpcentre"},
]


def seed(selected: list[str] | None = None, deactivate: list[str] | None = None):
    db = SessionLocal()
    created = []
    skipped = []
    deactivated = []
    try:
        if selected:
            target = [p for p in PROVIDERS if p["code"] in selected]
        else:
            target = PROVIDERS

        # Create providers
        for p in target:
            code = p["code"].upper()
            existing = db.query(models.ShipmentProvider).filter(models.ShipmentProvider.code == code).first()
            if existing:
                skipped.append(code)
                continue
            row = models.ShipmentProvider(
                name=p["name"],
                code=code,
                tracking_url=p.get("tracking_url"),
                active=True,
            )
            db.add(row)
            created.append(code)
        db.commit()

        # Deactivate requested codes
        if deactivate:
            for code in deactivate:
                r = db.query(models.ShipmentProvider).filter(models.ShipmentProvider.code == code.upper()).first()
                if r and r.active:
                    r.active = False
                    deactivated.append(code.upper())
            db.commit()
    finally:
        db.close()
    return created, skipped, deactivated


def main():
    ap = argparse.ArgumentParser(description="Seed shipment providers table")
    ap.add_argument("--only", help="Comma separated provider codes to seed (FEDEX,DHL,...)", default="")
    ap.add_argument("--deactivate", help="Comma separated codes to deactivate", default="")
    args = ap.parse_args()

    only = [c.strip().upper() for c in args.only.split(",") if c.strip()] or None
    deactivate = [c.strip().upper() for c in args.deactivate.split(",") if c.strip()] or None

    created, skipped, deactivated = seed(selected=only, deactivate=deactivate)
    print("=== Shipment Providers Seed Summary ===")
    print(f"Created: {created if created else 'None'}")
    print(f"Skipped (already existed): {skipped if skipped else 'None'}")
    print(f"Deactivated: {deactivated if deactivated else 'None'}")
    print("Total providers in list:", len(PROVIDERS))
    if only:
        print("Filtered seed codes:", only)


if __name__ == "__main__":
    main()
