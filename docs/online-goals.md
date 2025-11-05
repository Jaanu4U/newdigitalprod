# Online (Cloud) Goals

## Objectives
- Provide secure, scalable multi-tenant API with per-org isolation via org_id.
- Centralized auth, subscription enforcement, reporting, and analytics.
- Reliable sync endpoints for offline clients.
- Automated backups, monitoring, and resiliency.

## Scope
- HTTPS API (FastAPI or NestJS) with JWT + refresh tokens.
- Org provisioning, subscription status, role/permission service.
- Multi-tenant PostgreSQL (per-org schema or row-level security strategy).
- Reporting endpoints and dashboards.
- Rate limiting, WAF, API gateway integration.

Out of scope for MVP:
- Advanced ML analytics (moved to AI package).
- Cross-org data sharing features.

## Success Metrics (KPIs)
- API uptime ≥ 99.9%; error rate < 0.1%.
- Auth p95 latency ≤ 150ms; core endpoints p95 ≤ 250ms.
- RPO ≤ 5 minutes, RTO ≤ 15 minutes.
- Tenancy isolation verified by automated tests on each release.
- Cost efficiency: keep infra under agreed monthly budget.

## Milestones
1) Auth + org registration + subscription checks.
2) Multi-tenant DB scaffolding and migrations.
3) Sync endpoints: /sync/upload, /sync/download with pagination + checkpoints.
4) Reporting basics (inventory levels, order summaries).
5) Observability: metrics, tracing, structured logs, alerting (SLIs/SLOs).
6) Backup/restore + disaster recovery drill.
7) Security: secrets management, TLS, key rotation, CIS hardening.

## Acceptance Criteria
- New org can be provisioned and isolated in under 60s.
- Invalid tokens are rejected; expired tokens refresh via secure flow.
- Sync handles at least 10K records/hour/org without throttle violations.
- Daily encrypted backups tested with point-in-time restore.
- Pen test findings triaged and remediated before GA.
