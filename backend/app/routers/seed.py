from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models

router = APIRouter(tags=["dev"]) 

@router.post("/dev/seed-deliveries")
def seed_deliveries(org_id: str, count: int = 5, db: Session = Depends(get_db)):
    # Create sample deliveries for testing
    for i in range(count):
        d = models.Delivery(
            org_id=org_id,
            order_id=f"ORD-{i+1:04d}",
            customer=f"Customer {i+1}",
            address=f"123 Street #{i+1}, City",
            status="assigned",
        )
        db.add(d)
    db.commit()
    return {"status": "ok", "created": count}
