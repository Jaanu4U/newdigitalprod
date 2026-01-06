# DigitalChain: AI Coding Instructions

## Architecture Overview

**Multi-tenant hybrid supply chain system** supporting offline (LAN-based) and online (cloud-connected) operations.

### Services Structure
```
backend/           → FastAPI (Python 3.11+), PostgreSQL multi-tenant
admin-portal/      → Next.js 14 (App Router), TypeScript, Tailwind
rider-android/     → Kotlin + Jetpack Compose mobile app
whatsapp-service/  → Node.js WhatsApp Web integration (port 3001)
```

## Critical Patterns

### Multi-Tenancy (org_id Enforcement)
**ALWAYS filter database queries by `org_id`** to enforce tenant isolation:
```python
# ✅ CORRECT - filters by org_id from JWT token
deliveries = db.query(Delivery).filter(Delivery.org_id == principal.org_id).all()

# ❌ WRONG - exposes all organizations' data
deliveries = db.query(Delivery).all()
```

All tables except `Organization` and `User` must have `org_id` foreign key. Use `get_current_principal()` dependency to extract `org_id` from JWT.

### Subdomain Tenant Resolution
Organizations are identified via:
- **Subdomain**: `acme.digitalchain.in` → `Organization.slug = "acme"`
- **Custom domain**: `mycompany.com` → `Organization.custom_domain`
- **Header override**: `X-Org: acme` or `X-Org-Id: uuid`

See [backend/app/tenancy.py](backend/app/tenancy.py) - `TenantMiddleware` resolves tenant, avoiding reserved subdomains (`admin`, `api`, `www`).

### Authentication & Authorization

**Backend (FastAPI):**
- JWT tokens issued by `/v1/auth/login` (email, password, org_id optional if subdomain present)
- Token payload: `{sub: user_id, org_id: uuid, role: "Admin|Staff|SuperAdmin"}`
- Use `get_current_principal()` dependency for endpoints requiring org context
- Use `get_current_user()` for SuperAdmin endpoints (allows `org_id = None`)

**Admin Portal (Next.js):**
- Tokens stored in localStorage: `dc_access`, `dc_refresh`, `dc_role`, `dc_email`, `dc_org_id`
- API calls via [admin-portal/lib/api.ts](admin-portal/lib/api.ts) `apiBase()` - auto-selects prod/local URL
- Include `Authorization: Bearer ${token}` header on all authenticated requests

### Role-Based Access
- **SuperAdmin**: Platform-wide access, `org_id = null` in JWT
- **Admin**: Full org management, user invites, settings
- **Staff**: Daily operations (inventory, orders, limited permissions)
- **Inventory/Accountant/Rider**: Specialized roles with specific dashboards
- **Customer**: Self-service portal, read-only order tracking

Check role in backend via `principal.role`; frontend checks `localStorage.getItem("dc_role")`.

## Development Workflows

### Local Development Setup
```bash
# Database (PostgreSQL via Docker)
docker compose up -d db

# Backend (FastAPI) - port 8000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --app-dir .

# Admin Portal - port 3000
cd admin-portal
npm install && npm run dev

# WhatsApp Service - port 3001
cd whatsapp-service
npm install && node server.js
```

**Environment Variables:**
- Backend: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` (see [backend/app/core.py](backend/app/core.py))
- Admin Portal: `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000/v1/`)

**Important: Always use timezone-aware datetime objects** when working with tokens, expirations, or any time comparisons:
```python
from datetime import datetime, timezone
# ✅ CORRECT
expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
# ❌ WRONG - causes token validation issues
expires_at = datetime.utcnow() + timedelta(hours=24)
```

### Database Migrations
- Models defined in [backend/app/models.py](backend/app/models.py) (SQLAlchemy)
- Tables auto-created on startup for SQLite dev; use migration scripts for Postgres (see `backend/scripts/`)
- Example: `python backend/scripts/migrate_add_org_slug.py` adds slug/custom_domain columns

### Production Deployment
- System services: `digitalchain-backend.service`, `digitalchain-admin.service`
- Nginx reverse proxy with wildcard SSL (`*.digitalchain.in`)
- Config in [infra/](infra/) (nginx, systemd, env examples)
- Full guide: [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)

### Testing API Endpoints
```bash
# Health check
curl http://localhost:8000/v1/health

# Login (get token)
curl -X POST http://localhost:8000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@org.com","password":"pass123"}'

# Authenticated request (replace TOKEN)
curl http://localhost:8000/v1/customers \
  -H "Authorization: Bearer TOKEN"
```

Scripts in `backend/` like `test_audit.sh` provide examples.

## Code Conventions

### Backend Routers
- All routers in [backend/app/routers/](backend/app/routers/)
- Mounted in [backend/app/main.py](backend/app/main.py) with `/v1` prefix
- Pattern: `@router.get("/endpoint")` with `principal: CurrentPrincipal = Depends(get_current_principal)`
- **Always validate org_id** before DB queries

### Frontend Pages (Next.js App Router)
- File-based routing in [admin-portal/app/](admin-portal/app/)
- Client components: `"use client"` directive, `useState` for form state
- API calls fetch from `apiBase()` + endpoint, handle errors with try/catch
- Auth redirect in `useEffect`: check `localStorage.getItem("dc_access")`, redirect to `/login` if missing

### Real-Time Updates (WebSocket)
- WebSocket endpoint: `/ws?token=JWT_TOKEN`
- Manager in [backend/app/websocket.py](backend/app/websocket.py) broadcasts to org connections
- Example: rider location updates, delivery status changes
- Frontend connects via native WebSocket, listens for `{type: "...", data: {...}}`

### WhatsApp Integration
- Standalone Node.js service using `whatsapp-web.js`
- QR code auth flow: `/v1/whatsapp/init` → `/v1/whatsapp/qr/{session_id}` → `/v1/whatsapp/status/{session_id}`
- Sessions persist in `.wwebjs_auth/` and auto-restore on restart
- Send messages: `POST /v1/whatsapp/send` with `{session_id, phone, message}`

## Common Tasks

**Add a new API endpoint:**
1. Create or update router in `backend/app/routers/`
2. Use `get_current_principal()` dependency, filter by `principal.org_id`
3. Register router in `backend/app/main.py`

**Add a new admin page:**
1. Create folder in `admin-portal/app/my-page/`
2. Add `page.tsx` with `"use client"` if interactive
3. Fetch data using `apiBase() + "endpoint"` with `Authorization` header
4. Add navigation link in [admin-portal/app/dashboard/page.tsx](admin-portal/app/dashboard/page.tsx) or sidebar

**User management:**
- Extensive docs in [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) (quick ref, visual walkthrough, complete guide)
- Create users via UI (`/org-users`) or API (`POST /v1/org/{org_id}/users`)
- SuperAdmin users managed separately (`/superadmin` routes)

## Important Constraints

- **Never expose raw UUIDs** in customer-facing URLs - use short slugs or masked IDs
- **Audit sensitive operations** - invoice uploads, payment collections, user role changes (see [backend/app/routers/audit.py](backend/app/routers/audit.py))
- **Offline-first mindset** - rider app queues actions when offline, syncs when connected
- **Rate limit external APIs** - Google Maps usage tracked in `MapsApiUsage` table
- **Validate file uploads** - CSV bulk uploads parse with error reporting (see `customers/bulk-upload`, `invoice/bulk-upload`)

## Key Documentation
- [project.md](project.md) - Full architecture and goals
- [docs/organization-users-goals.md](docs/organization-users-goals.md) - RBAC details
- [docs/rider-android-app.md](docs/rider-android-app.md) - Mobile API contract
- [infra/README.md](infra/README.md) - Production deployment (DNS, SSL, systemd)
- [backend/README.md](backend/README.md), [admin-portal/README.md](admin-portal/README.md) - Service-specific setup
