from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, org, rider, health, seed, superadmin, org_users, account
from .db import Base, engine
from .tenancy import TenantMiddleware

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

app.include_router(health.router, prefix="/v1")
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(org.router, prefix="/v1/org", tags=["org"])
app.include_router(org_users.router, prefix="/v1", tags=["org-users"])  # org-scoped user management
app.include_router(rider.router, prefix="/v1/rider", tags=["rider"])
app.include_router(superadmin.router, prefix="/v1", tags=["superadmin"])
app.include_router(account.router, prefix="/v1", tags=["account"])  # /v1/me endpoints
app.include_router(seed.router, prefix="/v1", tags=["dev"])  # dev-only utilities


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
            conn.commit()
    except Exception:
        # Ignore if lacking permissions or on non-Postgres
        pass
