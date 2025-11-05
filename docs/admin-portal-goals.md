# Admin Portal Goals (Access, Settings, Monitoring)

## Objectives
- Provide a secure web portal for organization owners/admins to register, configure, and monitor their tenancy.
- Manage branding, packages/modules, access keys, users/roles, and device whitelisting.
- Offer observability: usage, sync status, error codes, billing/subscription.

## Access Model
- URL: `https://portal.digitalchain.in` (staging: `https://staging.portal.digitalchain.in`).
- Roles:
  - Owner: Full control (billing, packages, keys, users, org settings).
  - Admin: Manage users, packages, device whitelist, view monitoring.
  - Support (internal): Read-mostly + scoped actions via break-glass flow and audit.
- Authentication:
  - Email/password + MFA (TOTP/SMS) for Owner/Admin.
  - Optional SSO (SAML/OIDC) for enterprise plans.
  - Session management with refresh tokens; device trust list per user.

## Core Flows
### 1) Organization Registration
- Endpoint: `POST /v1/org/register`
- Inputs: org_name, admin_name, admin_email, plan, region.
- Output: `org_id`, `access_key`, initial Owner user, default schema/tenant.
- Email verification + MFA bootstrap.

### 2) Login
- Endpoint: `POST /v1/auth/login`
- MFA challenge if enabled.
- Issue access/refresh tokens scoped to `org_id` and role.

### 3) Dashboard
- Overview widgets:
  - Sync status: last sync time, backlog size, conflict rate.
  - Usage: active devices, active users, inventory and orders counts.
  - Errors: top error codes (E1001/E3001/etc.), last 24h failure rate.
  - Subscription: plan, limits, renewal date.

## Settings & Management
### Organization Profile
- Org details (name, address, region, timezone).
- Branding:
  - Logo upload (PNG/SVG/JPEG, ≤ 2 MB, 1024×1024 max, square recommended).
  - Stored in object storage (e.g., S3) with per-org path; CDN cached with cache-bust on update.
- Public metadata used across emails/portal.

### Packages / Modules
- Toggle modules per subscription: `pkg_core`, `pkg_finance`, `pkg_hrm`, `pkg_crm`, `pkg_ai`.
- Enforcement via feature flags and backend authorization checks.
- Safe-guard: downscaling warns if data would become inaccessible; requires explicit confirm.

### Access Keys & Credentials
- Keys:
  - Org Access Key: identifies the tenant for offline clients during bootstrap.
  - API Keys: per environment (dev/stage/prod), scope-limited, rate-limited.
  - Device Enrollment Tokens: single-use tokens to enroll mobile/desktop devices.
- Operations:
  - Create, rotate, revoke with reason and expiry.
  - Download as `.json` with checksum; masked display by default.
  - Rotation policy reminder and webhook to notify integrators.
- Storage:
  - Encrypted at rest using KMS; access via secure vault service.

### Users & Roles (RBAC)
- CRUD users, assign roles (Owner/Admin/Manager/Staff/Support).
- Fine-grained permissions mapped to portal features and API scopes.
- Mandatory MFA policy toggle per org/role.

### Device Whitelisting (Mobile/Desktop)
- Register devices with `device_id` bound to `org_id` and user.
- Attestation integration (Play Integrity / DeviceCheck); block rooted/jailbroken.
- Certificate pinning; token binding to device record.
- Actions: approve, revoke, rotate, view history.

## Monitoring & Observability
### Metrics & Dashboards
- Usage: daily active users/devices, peak concurrency.
- Sync: backlog depth, last successful sync, conflict count/trend.
- API: latency (p50/p95/p99), error rates, throttling events.
- Data: inventory/order volumes, growth curves.

### Logs & Audits
- Admin actions (who/what/when/where), immutable audit trail.
- Security events: failed logins, MFA failures, token anomalies.
- Sync logs: batch ids, sizes, durations, conflict resolutions.

### Alerts
- Email/Slack/Webhook notifications for:
  - Sync stalled > X minutes or backlog > threshold.
  - Error rate above SLO.
  - Key nearing expiry or recently revoked.
  - Device attestation failures spike.

## Billing & Subscription
- Plans: Core, Pro, Enterprise (feature & limit matrix).
- Payment gateway integration, invoices, dunning.
- Quotas: records, devices, API calls; soft warnings and hard caps.

## Security
- Least-privilege RBAC, periodic permission review.
- TLS everywhere; HSTS; CSRF protection for web.
- Secrets in vault; keys in KMS; regular rotation.
- Data residency control (region-bound tenants).
- Pen tests and dependency scanning in CI.

## APIs (Representative)
- `POST /v1/org/register` – create org + Owner.
- `POST /v1/auth/login` – login + MFA.
- `GET/PUT /v1/org/{org_id}/settings` – profile/branding.
- `GET/POST/DELETE /v1/org/{org_id}/packages` – manage modules.
- `GET/POST/DELETE /v1/org/{org_id}/keys` – manage keys (rotate/revoke).
- `GET/POST /v1/org/{org_id}/devices` – whitelist devices.
- `GET /v1/org/{org_id}/metrics` – portal dashboard data.
- `GET /v1/org/{org_id}/audit` – audit logs.

## KPIs
- Registration to ready tenant < 60s.
- p95 dashboard load time ≤ 800ms.
- 0 leakage across org boundaries (verified tests).
- ≥ 99% successful key rotations without service interruption.
- Alert MTTR < 30m for P2 incidents.

## Milestones
1) Registration + login + MFA + Owner bootstrap.
2) Org settings (branding) + file storage + CDN cache-bust.
3) Packages feature flags and authorization wiring.
4) Keys lifecycle (create/rotate/revoke) + vault/KMS.
5) Device whitelist + attestation MVP.
6) Metrics, audit logs, and alerting integrations.
7) Billing integration + quota enforcement.

## Acceptance Criteria
- Owner can register, login, set logo/branding, enable packages, and generate keys.
- Admin can manage users/devices; all actions audited.
- Dashboards display accurate real-time metrics with SLO-compliant latency.
- Keys are stored/searched/rotated securely; revocation propagates within 5 minutes.
- Security reviews passed; tenancy boundaries validated by automated tests.
