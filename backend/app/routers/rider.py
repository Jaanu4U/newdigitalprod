from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas
from datetime import datetime
import uuid
from ..deps import get_current_org_id

router = APIRouter()

@router.get("/deliveries", response_model=schemas.DeliveriesOut)
def list_deliveries(org_id: str = Depends(get_current_org_id), db: Session = Depends(get_db)):
    rows = db.query(models.Delivery).filter(models.Delivery.org_id == org_id).all()
    items = [schemas.DeliveryOut(
        delivery_id=r.delivery_id,
        order_id=r.order_id,
        customer=r.customer,
        address=r.address,
        status=r.status
    ) for r in rows]
    return {"items": items}

@router.get("/deliveries/{delivery_id}", response_model=schemas.DeliveryOut)
def get_delivery(delivery_id: str, org_id: str = Depends(get_current_org_id), db: Session = Depends(get_db)):
    d = (
        db.query(models.Delivery)
        .filter(models.Delivery.delivery_id == delivery_id, models.Delivery.org_id == org_id)
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return schemas.DeliveryOut(
        delivery_id=d.delivery_id,
        order_id=d.order_id,
        customer=d.customer,
        address=d.address,
        status=d.status,
    )

@router.post("/deliveries/{delivery_id}/status", response_model=schemas.StatusUpdateOut)
def update_status(delivery_id: str, payload: schemas.StatusUpdateIn, org_id: str = Depends(get_current_org_id), db: Session = Depends(get_db)):
    d = db.query(models.Delivery).filter(models.Delivery.delivery_id == delivery_id, models.Delivery.org_id == org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Delivery not found")
    d.status = payload.status
    log = models.SyncLog(org_id=org_id, user_id=None, type="status_update", payload=str({"delivery_id": delivery_id, "status": payload.status}))
    db.add(log)
    db.commit()
    return {"status": "ok", "delivery_id": delivery_id, "new_status": d.status}

@router.post("/deliveries/{delivery_id}/pod", response_model=schemas.PodOut)
def upload_pod(delivery_id: str, payload: schemas.PodIn, org_id: str = Depends(get_current_org_id), db: Session = Depends(get_db)):
    # Store only metadata in this starter
    log = models.SyncLog(org_id=org_id, user_id=None, type="pod", payload=str({"delivery_id": delivery_id, "recipient_name": payload.recipient_name}))
    db.add(log)
    db.commit()
    return {"status": "ok", "pod_id": str(uuid.uuid4())}

@router.post("/location")
def push_location(points: dict, org_id: str = Depends(get_current_org_id), db: Session = Depends(get_db)):
    log = models.SyncLog(org_id=org_id, user_id=None, type="location", payload=str(points))
    db.add(log)
    db.commit()
    return {"status": "ok"}
