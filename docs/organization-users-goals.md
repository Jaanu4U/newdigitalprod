# Organizations and Users Goals (Tenancy, Roles, Access)

## Objectives
- Define a clear multi-tenant model where each organization (org) is fully isolated by `org_id`.
- Provide robust user and role management (RBAC) with least-privilege defaults.
- Support secure onboarding (registration/invite), MFA, SSO (enterprise), and device trust.
- Ensure auditable changes for compliance and incident response.

## Entities & Core Concepts
- Organization
  - Fields: org_id (UUID), name, region, timezone, plan, status (active/suspended), created_at, updated_at
  - Branding: logo_url, brand_colors, support_email, domain
  - Limits/quotas: max_users, max_devices, storage, api_rate
- User
  - Fields: user_id, org_id, email, name, role, status (active/invited/disabled), mfa_enabled, last_login
  - Security: password hash or SSO subject, password_updated_at, failed_attempts
- Role (RBAC)
  - Built-in roles: Owner, Admin, Manager, Staff, Supplier, Customer
  - Permissions: arrays/scopes (e.g., org:read, org:update, users:invite, inventory:write, orders:approve)
  - Optional custom roles (later phase) with per-permission toggles
- Access Keys
  - Org Access Key for offline bootstrap; API keys per environment (dev/stage/prod)
  - Device Enrollment Tokens (single-use) for mobile/desktop
- Device (optional in this doc; detailed in mobile goals)
  - device_id, org_id, user_id, platform, status, attestation state

## Role Responsibilities & Goals
- Owner
  - Manage subscription/billing, tenant-wide security, key rotation
  - Approve high-risk changes (plan, data export, SSO config)
- Admin
  - User lifecycle, role assignments, device whitelist, package toggles
  - Configure org settings and branding
- Manager
  - Oversee inventory/orders, approvals, and team KPIs
- Staff
  - Operate daily workflows (inventory counts, order processing), offline-first
- Inventory
  - Maintain stock accuracy, cycle counts, SKU/bin hygiene; propose replenishment; support audits
- Accountant
  - Handle invoicing, ledgers/journals, tax compliance, reconciliations; ensure on-time close
- Rider
  - Perform last‑mile delivery using mobile app with Google Maps; update statuses and capture PoD
- Supplier
  - Receive/manage POs, update fulfillment status, restricted visibility
- Customer
  - View orders, tracking, limited self-service, zero write to core ops

## User Lifecycle
1) Invite or Self-register (depending on org policy)
   - Invite email with secure token; expiry and single-use
2) Account Setup
   - Password policy enforcement or SSO binding; MFA bootstrap
3) Role Assignment
   - Default least-privilege (e.g., Staff) unless explicitly elevated
4) Device Enrollment (optional)
   - Whitelist and attestation for mobile/desktop
5) Maintenance
   - Password rotation, session/device review, periodic access recertification
6) Deactivation/Offboarding
   - Immediate token revocation, device revoke, audit trail

## Organization Lifecycle
1) Registration (via Admin Portal or API)
   - org_id + Owner account created; initial access key issued
2) Configuration
   - Branding, timezone/region, packages, quotas
3) Operations
   - User management, device whitelist, monitoring
4) Suspension/Termination
   - Data retention policy applied; export window and final purge

## Security & Compliance
- MFA default for Owner/Admin; optional for others (org policy)
- SSO (SAML/OIDC) support for enterprise plans
- Session & token hygiene (refresh rotation, IP/device checks)
- Password policy: min length, complexity, breach checks
- Auditing: immutable logs of user/role/org changes
- Data isolation: enforce org_id on every request and query

## API Surface (Representative)
- Org
  - POST /v1/org/register – create org + Owner
  - GET/PUT /v1/org/{org_id}/settings – profile/branding/quotas
- Users
  - POST /v1/org/{org_id}/users/invite – invite user
  - POST /v1/org/{org_id}/users – create user (service flow)
  - GET /v1/org/{org_id}/users – list users (filters, pagination)
  - GET/PUT/DELETE /v1/org/{org_id}/users/{user_id} – manage user
  - POST /v1/org/{org_id}/users/{user_id}/deactivate – offboard
- Roles & Permissions
  - GET /v1/meta/roles – built-in roles
  - GET/POST /v1/org/{org_id}/roles – custom roles (later phase)
  - GET/PUT /v1/org/{org_id}/users/{user_id}/role – assign role
- Keys
  - GET/POST/DELETE /v1/org/{org_id}/keys – API keys lifecycle
  - POST /v1/org/{org_id}/keys/rotate – rotation flow

## KPIs / Success Metrics
- Onboarding: invite-to-activation ≤ 24 hours (p95 ≤ 2h for engaged users)
- Security: ≥ 95% MFA enablement for privileged roles
- Access hygiene: zero privilege escalation incidents; quarterly access review
- Operations: user CRUD p95 latency ≤ 250ms; list users pagination p95 ≤ 300ms
- Audit completeness: ≥ 99.9% admin actions recorded with actor/time/source

## Milestones
1) Org registration + Owner bootstrap + access key issuance
2) User invite + activation + MFA + role assignment
3) Users list/search + pagination + filtering (status/role/date)
4) RBAC enforcement across APIs and UI; least-privilege defaults
5) Audit log for all user/role/org changes; export/search UI
6) Optional SSO integration + SCIM (enterprise)

## Acceptance Criteria
- Owner can register org, configure settings, and invite users with correct roles
- Admin can manage users end-to-end; every action is audited
- Requests are scoped by org_id and blocked across tenants
- API keys/Access keys can be created, rotated, revoked, and traced in audits
- Automated tests validate RBAC and org isolation on each release
