# Digitalchain Backend (FastAPI)

A minimal FastAPI backend starter implementing essentials: health, auth, org registration, and rider endpoints aligned with docs.

## Requirements
- Python 3.11+
- (Optional) Docker for Postgres via docker-compose

## Setup
1) Create and activate a virtualenv
2) Install dependencies:
   - pip install -r backend/requirements.txt
3) Set environment variables (or use defaults):
   - DATABASE_URL (default: sqlite:///./digitalchain.db)
   - JWT_SECRET (default: dev-secret-change-me)
   - JWT_EXPIRES_IN (default: 604800)

## Run
- uvicorn app.main:app --reload --port 8000 --app-dir backend

Health: GET http://localhost:8000/v1/health

## Endpoints (representative)
- POST /v1/org/register
- POST /v1/auth/login
- POST /v1/auth/refresh
- GET  /v1/rider/deliveries (Authorization: Bearer ...)
- POST /v1/rider/deliveries/{id}/status (Authorization: Bearer ...)
- POST /v1/rider/deliveries/{id}/pod (Authorization: Bearer ...)
- POST /v1/rider/location (Authorization: Bearer ...)

## Notes
- This starter uses SQLite by default for quick dev. Switch to Postgres by setting DATABASE_URL to a psycopg URL, e.g. `postgresql+psycopg2://user:pass@localhost:5432/digitalchain`.
- Models are defined in a single file for brevity; you can split them later.
- On startup, the app attempts to create tables automatically for quick dev (SQLite). For Postgres or production, set up Alembic migrations.

## Multi-tenant (subdomain) support
The backend now supports resolving tenants from the Host header or an `X-Org` header:

- Organization has fields: `slug` (unique, used for subdomain like slug.digitalchain.in) and `custom_domain` (optional, unique).
- A tenant middleware reads `X-Org` (if present) or parses the request `Host` to determine the tenant.
- Auth login can omit `org_id` if the tenant is resolved from headers.

### Migration
Add the new columns and indexes to an existing database:

```bash
python backend/scripts/migrate_add_org_slug.py
```

### Nginx and DNS
- DNS: configure `*.digitalchain.in` to point at your server.
- TLS: use a wildcard certificate for `*.digitalchain.in`.
- Nginx: for org subdomains, proxy to the portal and pass `X-Org` with the subdomain. See `infra/nginx/org-https.conf.example`.

