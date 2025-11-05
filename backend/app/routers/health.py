from fastapi import APIRouter
import time

router = APIRouter(tags=["health"]) 

@router.get("/health")
async def health():
    return {"status": "OK", "timestamp": time.time()}
