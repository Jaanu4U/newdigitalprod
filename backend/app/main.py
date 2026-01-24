from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, org, rider, health, seed, superadmin, org_users, account, platform, providers, customers, invoice, invoice_pdf, whatsapp, rider_delivery, audit, payment, customer_portal, tracking
from .db import Base, engine
from .tenancy import TenantMiddleware
from .websocket import manager
from .deps import get_current_principal_ws


print(f"[Digitalchain] Running main.py from: {os.path.abspath(__file__)}")
app = FastAPI(title="Digitalchain API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Tenant resolution (reads Host or X-Org header)
app.add_middleware(TenantMiddleware)

# Mount uploads directory for serving static files
uploads_dir = os.path.join(os.path.dirname(__file__), '..', 'uploads')
uploads_dir = os.path.abspath(uploads_dir)
print(f"📁 Mounting uploads from: {uploads_dir}")
print(f"📁 Directory exists: {os.path.exists(uploads_dir)}")
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    print(f"✅ Mounted /uploads to {uploads_dir}")

app.include_router(health.router, prefix="/v1")
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(org.router, prefix="/v1/org", tags=["org"])
app.include_router(org_users.router, prefix="/v1", tags=["org-users"])  # org-scoped user management
app.include_router(rider.router, prefix="/v1/rider", tags=["rider"])
app.include_router(rider_delivery.router, prefix="/v1", tags=["rider-delivery"])  # rider delivery management
app.include_router(superadmin.router, prefix="/v1", tags=["superadmin"])
app.include_router(account.router, prefix="/v1", tags=["account"])  # /v1/me endpoints
app.include_router(seed.router, prefix="/v1", tags=["dev"])  # dev-only utilities

# Register platform router for platform-wide settings (maps, email, etc)
app.include_router(platform.router, prefix="/v1/platform", tags=["platform"])

# Register providers router for shipment providers
app.include_router(providers.router, prefix="/v1", tags=["providers"])

# Register customers router for customer management
app.include_router(customers.router, prefix="/v1", tags=["customers"])

# Register customer portal router for customer self-service
app.include_router(customer_portal.router, prefix="/v1/customer-portal", tags=["customer-portal"])

# Register tracking router for real-time rider location tracking
app.include_router(tracking.router, prefix="/v1", tags=["tracking"])

# Register invoice router for invoice management (sharing, email, bulk upload, sync)
app.include_router(invoice.router, prefix="/v1", tags=["invoice"])

# Register invoice PDF router for invoice PDF generation
app.include_router(invoice_pdf.router, prefix="/v1", tags=["invoice-pdf"])

# Register WhatsApp router for WhatsApp integration
app.include_router(whatsapp.router, tags=["whatsapp"])

# Register audit router for order audit trail
app.include_router(audit.router, prefix="/v1", tags=["audit"])

# Register payment router for UPI payment collection
app.include_router(payment.router, prefix="/v1", tags=["payment"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    """WebSocket endpoint for real-time updates"""
    # Accept connection first to avoid middleware issues
    await websocket.accept()
    
    try:
        # Get user info from token
        principal = await get_current_principal_ws(token)
        if not principal or not principal.org_id:
            print(f"[WebSocket] Unauthorized connection attempt, token valid: {token is not None}")
            await websocket.close(code=1008, reason="Unauthorized")
            return
        
        print(f"[WebSocket] Client connected: org_id={principal.org_id}, user_id={principal.user_id}")
        await manager.connect(websocket, principal.org_id)
        
        try:
            while True:
                # Keep connection alive and listen for messages
                data = await websocket.receive_text()
                
                # Parse incoming message
                try:
                    import json
                    message = json.loads(data)
                    
                    # Handle rider location updates
                    if message.get("type") == "rider_location_update":
                        # Broadcast to all clients in the same org
                        await manager.broadcast_to_org(principal.org_id, message)
                    else:
                        # Echo back for other message types
                        await websocket.send_text(f"Received: {data}")
                except json.JSONDecodeError:
                    await websocket.send_text(f"Received: {data}")
                    
        except WebSocketDisconnect:
            manager.disconnect(websocket, principal.org_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass


@app.on_event("startup")
def on_startup():
    # For quick local dev without migrations; safe for SQLite dev only
    try:
        # Import models so metadata is populated
        from . import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
    except Exception:
        # If running with proper migrations or missing permissions, ignore
        pass
    
    # Lightweight migration: ensure 'created_by' column exists on users
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR"))
            # Org settings JSON column
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSON"))
            # Org address fields
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pincode VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country VARCHAR"))
            # Email verification fields
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP"))
            conn.commit()
    except Exception:
        # Ignore if lacking permissions or on non-Postgres
        pass
