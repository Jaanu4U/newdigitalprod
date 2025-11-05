# Organization Users: List and Responsibilities

This document lists all standard user roles in Digitalchain and clarifies their responsibilities, permissions, common actions, and access scope. Use it to assign roles, design RBAC policies, and train teams.

## Quick Role Matrix

| Role       | Primary Responsibilities                                   | Typical Actions                                                     | Access Scope                              | Offline Usage |
|-----------|--------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------|---------------|
| Owner     | Subscription, security posture, key rotation, approvals     | Register org, set branding, enable packages, rotate/revoke keys     | Tenant-wide (all data), high-risk actions  | Limited       |
| Admin     | User/device management, RBAC, settings, package toggles     | Invite users, assign roles, whitelist devices, manage API keys       | Tenant-wide (admin surfaces)               | Limited       |
| Manager   | Team operations, approvals, KPI tracking                     | Approve orders, adjust inventory thresholds, view reports            | Org data for their domain/team             | Yes           |
| Inventory | Stock accuracy, replenishment, cycle counts, SKU hygiene     | Create/adjust stock, perform counts, manage locations/SKUs           | Inventory entities for assigned sites      | Yes           |
| Accountant| Billing, invoicing, tax/ledger, reconciliation               | Generate invoices, post journals, reconcile payouts and taxes        | Finance data; read-only ops as needed      | Limited       |
| Rider     | Last-mile delivery, route adherence, PoD collection          | Navigate routes, update ETA/status, capture signature/photo PoD      | Assigned delivery orders only              | Yes (mobile)  |
| Staff     | Day-to-day operations on inventory and orders                | Create/update orders, scan stock, record movements                   | Operational data assigned to their site    | Yes           |
| Supplier  | Fulfill purchase orders, update shipment statuses            | View assigned POs, upload ASN/invoices, confirm deliveries           | Own POs and related items                  | Limited       |
| Customer  | Track orders and statuses                                    | View order history, download invoices, create support tickets        | Their own orders and documents             | Limited       |
| Support*  | Internal support with scoped access and full auditing        | Troubleshoot, view logs/metrics, perform break-glass under approval  | Read-mostly; elevated via approval windows | No            |

(*) Support is an internal role with strict audit and time-bound elevation.

---

## Role Details

### Owner
- Responsibilities
  - Own subscription and billing; choose plan and region.
  - Approve high-risk changes (packages downscale, data export, SSO config).
  - Oversee security: enforce MFA, key rotation cadence, policy baselines.
- Key Permissions
  - org:read/update, packages:manage, billing:manage, keys:manage, users:assign-owner, sso:manage
- Typical Actions
  - Upload/update logo and branding, set timezone and policies.
  - Create/rotate/revoke access keys and API keys; download with checksum.
  - Configure SSO (enterprise) and mandatory MFA rules.
- Access Scope: Full tenant, including billing and key management.
- KPIs: 100% MFA for privileged users, on-time key rotations, no cross-tenant access incidents.

### Admin
- Responsibilities
  - Manage users/roles, device whitelist, and RBAC policies.
  - Apply package toggles and enforce data access boundaries.
- Key Permissions
  - users:invite/update/deactivate, roles:assign, devices:manage, packages:toggle, org:settings:read/update
- Typical Actions
  - Invite users, reset MFA, review sessions/devices, revoke compromised tokens.
  - Approve/revoke device enrollment and review attestation failures.
- Access Scope: Tenant-wide admin surfaces; no billing unless also Owner.
- KPIs: Time-to-provision ≤ 1h, zero unauthorized access, complete audit trails.

### Manager
- Responsibilities
  - Ensure operational throughput and data quality; approve sensitive workflows.
  - Track team KPIs and remediate backlog/conflicts.
- Key Permissions
  - inventory:read/write, orders:read/approve, reports:read
- Typical Actions
  - Approve large orders/adjustments; view dashboards and trends.
- Access Scope: Operational domains and sites under their remit.
- KPIs: Order SLA adherence, inventory accuracy, low conflict rate post-sync.

### Staff
- Responsibilities
  - Execute daily tasks offline-first; keep data accurate.
- Key Permissions
  - inventory:read/write, orders:read/write (scoped), sync:queue
- Typical Actions
  - Create/update orders; perform counts; handle scanning and receiving.
- Access Scope: Data limited to assigned location/projects.
- KPIs: Low error rate, timely sync on reconnect, task completion throughput.

### Inventory
- Responsibilities
  - Maintain stock accuracy, execute cycle counts, manage SKUs and bin locations.
  - Initiate replenishment proposals and flag variances/anomalies.
- Key Permissions
  - inventory:read/write, locations:manage, adjustments:create (manager approval for large deltas)
- Typical Actions
  - Perform counts (blind/guided), receive/put-away, create transfers, print labels.
- Access Scope: Inventory entities for assigned sites/warehouses only.
- KPIs: Inventory accuracy %, count coverage %, variance resolution time, shrinkage rate.

### Accountant
- Responsibilities
  - Manage billing/invoicing, taxes, journals/ledgers, and reconciliations.
  - Ensure compliance and period close; coordinate with operations for valuation.
- Key Permissions
  - finance:read/write, invoices:manage, journals:post, payouts:reconcile, reports:finance
- Typical Actions
  - Generate invoices/credit notes, post journal entries, reconcile payments/taxes.
- Access Scope: Finance and reporting; read-only operational data as needed for valuation.
- KPIs: On-time close, reconciliation accuracy, invoice DSO, tax compliance rate.

### Rider
- Responsibilities
  - Execute last‑mile deliveries along assigned routes; ensure proof of delivery (PoD).
  - Follow navigation and safety policies; maintain real-time status updates.
- Key Permissions
  - deliveries:read (assigned), deliveries:update-status, pod:upload, location:share
- Typical Actions
  - Use mobile app with Google Maps for turn-by-turn navigation, live ETA.
  - Update statuses (out-for-delivery, delivered/failed), capture PoD (signature/photo).
- Access Scope: Assigned delivery orders/stops only; no access to internal inventory/finance.
- KPIs: On-time delivery %, first-attempt success %, accurate PoD, route adherence.

### Supplier
- Responsibilities
  - Fulfill POs and provide shipment documents.
- Key Permissions
  - po:read (assigned), shipments:update, documents:upload
- Typical Actions
  - Confirm shipment, upload ASN/invoice, update delivery status.
- Access Scope: Their POs only; no visibility into internal inventory.
- KPIs: On-time deliveries, ASN match rate, document completeness.

### Customer
- Responsibilities
  - Track orders and access documents.
- Key Permissions
  - orders:read (self), documents:download, support:ticket:create
- Typical Actions
  - View order status/history, download invoices/packing slips.
- Access Scope: Their own orders; zero write to core operational data.
- KPIs: Ticket resolution time, satisfaction score.

### Support (Internal)
- Responsibilities
  - Assist tenants with troubleshooting under strict audit.
- Key Permissions
  - support:read, logs:read, metrics:read; temporary break-glass for actions
- Typical Actions
  - Investigate errors, guide admins, raise incidents, time-bound elevation.
- Access Scope: Read-mostly; write only with approval and auto-revocation.
- KPIs: MTTR, zero unauthorized changes, audit completeness.

---

## Do/Don’t by Role (Guardrails)
- Owner/Admin: Do rotate keys regularly; don’t share keys or disable MFA.
- Manager: Do approve within SLAs; don’t override controls without audit notes.
- Staff: Do sync promptly; don’t bypass scanning/validation flows.
- Inventory: Do follow double-count workflow on variances; don’t adjust without approval when thresholds exceeded.
- Accountant: Do enforce period locks; don’t post manual journals without references.
- Rider: Do use assigned routes and capture PoD; don’t share device/credentials or disable location during delivery.
- Supplier/Customer: Do keep contact and document info current; don’t request internal data.

## RBAC Notes
- Least privilege defaults: new users start as Staff unless elevated.
- Permissions are additive; temporary elevations auto-expire and are audited.
- All requests require org_id scoping and are denied on cross-tenant access.

## Related
- Organizations & Users Goals: ./organization-users-goals.md
- Admin Portal Goals: ./admin-portal-goals.md
- Whitelisted Mobile Apps Goals: ./whitelisted-mobile-apps-goals.md
