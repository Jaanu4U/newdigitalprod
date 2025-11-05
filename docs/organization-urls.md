# Organization-specific URLs (Multi-tenant)

This document explains how to give every organization its own unique URL for registration and login.

Common patterns:
- Subdomain per org (recommended): https://orgslug.digitalchain.in
- Path-based per org: https://digitalchain.in/o/orgslug
- Custom domain per org: https://portal.acme.com (CNAME to your host)

## Recommendation
Prefer subdomains per org. It gives each org a clean URL, isolates browser storage (cookies/localStorage) by origin, simplifies SEO/branding, and makes path routing simpler in the app.

## Requirements
- DNS: wildcard A record for *.digitalchain.in to your server IP, keep existing admin and api records.
- TLS: wildcard certificate for *.digitalchain.in (DNS-01 challenge). Alternatively, on-demand per-subdomain but wildcard is simpler.
- Nginx: wildcard vhost that extracts the subdomain and forwards it to the portal, passing X-Org header.
- App (Next.js): detect tenant from host header; load tenant config; route login/registration accordingly.
- API (FastAPI): resolve tenant (org) by subdomain or custom domain; attach org_id to request context and enforce on queries.
- Database: add fields to Organization for slug (unique) and optional custom_domain (unique, nullable).

## DNS
Add record at your provider (example):

Type | Host                | Value            | TTL
---- | ------------------- | ---------------- | ---
A    | *.digitalchain.in   | 103.49.131.101   | 300
A    | admin.digitalchain.in | 103.49.131.101 | 300
A    | api.digitalchain.in   | 103.49.131.101 | 300

Keep admin/api as-is. The wildcard will cover other subdomains.

## TLS (Let’s Encrypt)
- Use a wildcard cert for *.digitalchain.in via DNS-01 (e.g., certbot + cloudflare plugin, or acme.sh).
- Alternatively, provision per-subdomain certs automatically (more complex).

## Nginx (wildcard vhost)
See infra/nginx/org-https.conf.example for a full template. Key points:
- Match any subdomain except reserved names (admin, api).
- Pass the subdomain to upstream as X-Org.
- Proxy to your Next.js portal service (e.g., http://127.0.0.1:3100).

## Next.js (tenant detection)
Two options:
1) Middleware-based rewrite to inject tenant context.
2) Read tenant from headers in server components.

Example middleware.ts:

```ts
// admin-portal/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RESERVED = new Set(['admin','api','www'])

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const match = host.match(/^([^\.]+)\.digitalchain\.in$/)
  const sub = match?.[1]

  if (sub && !RESERVED.has(sub)) {
    // Forward subdomain to app via request header (available in Server Components)
    const res = NextResponse.next({ request: { headers: req.headers } })
    res.headers.set('x-org', sub)
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Run for portal routes (tune as needed)
    '/((?!_next|api|static).*)',
  ],
}
```

In server components or route handlers:

```ts
import { headers } from 'next/headers'
export function getTenantSlug() {
  const h = headers()
  return h.get('x-org') || null
}
```

Use the slug to load org-specific config and perform login/registration against API.

## FastAPI (tenant resolution)
Add an Organization.slug and optional Organization.custom_domain. Then resolve tenant per request:

```py
# backend/app/tenancy.py
from fastapi import Request
from sqlalchemy.orm import Session
from .models import Organization

RESERVED = {"admin","api","www"}

def get_tenant_from_host(host: str) -> str | None:
    # orgslug.digitalchain.in or custom domain
    if host.endswith('.digitalchain.in'):
        sub = host.split('.', 1)[0]
        if sub and sub not in RESERVED:
            return ('slug', sub)
    return ('domain', host)

async def tenant_middleware(request: Request, call_next):
    host = request.headers.get('host','')
    kind, value = get_tenant_from_host(host)
    request.state.tenant_lookup = (kind, value)  # to be used in dependencies
    return await call_next(request)
```

Attach middleware in main.py and create a dependency to fetch org_id by slug/domain before protected routes. Example dependency:

```py
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import Organization

async def require_tenant(request: Request, db: Session = Depends(get_db)):
    kind, value = getattr(request.state, 'tenant_lookup', (None, None))
    if not value:
        raise HTTPException(status_code=404, detail='Unknown tenant')
    if kind == 'slug':
        org = db.query(Organization).filter_by(slug=value, status='active').first()
    else:
        org = db.query(Organization).filter_by(custom_domain=value, status='active').first()
    if not org:
        raise HTTPException(status_code=404, detail='Unknown tenant')
    request.state.org = org
    return org
```

Use `require_tenant` where needed (or globally) and include `org_id=request.state.org.org_id` in queries.

## Database changes
- Add to Organization:
  - `slug: String, unique, not null`
  - `custom_domain: String, unique, nullable`
- Add unique index on slug; consider lowercase normalization.
- Migrate data: backfill slugs for existing orgs (e.g., kebab-case of name + short hash).

## Auth considerations
- JWT can embed `org_id` for stronger scoping. Validate that the token org_id matches the resolved tenant.
- With subdomains, localStorage and cookies are origin-scoped—no cross-org leakage.
- CORS: the API currently allows `*`. You can restrict to `https://*.digitalchain.in` and known custom domains later.

## Edge cases & rules
- Reserved subdomains: admin, api, www (serve admin/API or 404).
- Unknown or disabled org → 404/403 with support link.
- Custom domain support: set CNAME to your host and add to Organization.custom_domain.

## Rollout plan
1) Add DNS wildcard and wildcard TLS.
2) Deploy Nginx wildcard vhost → forward X-Org header.
3) Add Organization.slug/custom_domain, migrations.
4) Implement tenant resolution in API and portal.
5) Update registration flow to set slug during org creation.
6) Test with two sample orgs on staging: acme.digitalchain.in, beta.digitalchain.in.

