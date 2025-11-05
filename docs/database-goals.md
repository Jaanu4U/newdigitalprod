# Database Goals (Cloud + Offline)

## Objectives
- Robust multi-tenant Postgres in cloud; lightweight SQLite (or local Postgres) offline.
- Clear ERD, indexing strategy, and migration pipeline.
- Secure at-rest and in-transit; auditable changes.
- Deterministic sync and conflict resolution.

## Cloud (PostgreSQL)
- Tenancy: per-org schema or RLS; decide and document trade-offs.
- Schema: organizations, users, roles, inventory, orders, sync_log, error_codes.
- Performance: essential indexes, partitioning for large tables.
- Migrations: Alembic (Python) or Prisma Migrate (Node) with versioning.
- Backups: daily full + WAL archiving; PITR tested quarterly.
- HA: primary + replica; failover tested.

## Offline (SQLite)
- Mirror of critical tables (users, inventory, orders, sync_log).
- Pragmatic indexing (write-heavy vs read-heavy balance).
- Encrypted DB file; local key management.

## Sync & Conflicts
- Change tracking with updated_at/version; tombstones for deletes.
- Upload in batches with idempotency keys; server assigns authoritative versions.
- Latest-write-wins for MVP; per-field merge later.
- Conflict events recorded in sync_log with resolution summary.

## Security & Compliance
- Encryption at rest (cloud KMS) and TLS in transit.
- Hashing/salting for passwords; field-level encryption where needed.
- Audit tables for sensitive changes.
- Data retention policies per entity; GDPR/DPDP aligned.

## KPIs
- p95 query latency: inventory < 50ms, orders < 80ms (typical load).
- Migration downtime: zero for minor, < 5m for major (blue/green or rolling).
- Backup success rate ≥ 99.9%; verified restores quarterly.
- Sync integrity: 0 unapplied or duplicate batches post-commit.

## Milestones
1) ERD draft + review; choose tenancy model (schema vs RLS).
2) Baseline schema + seed data + indexes.
3) Migration pipeline wired into CI/CD.
4) Backup/restore automation + runbook.
5) Sync versioning and tombstone strategy implemented.
6) Performance test and tuning pass.

## Acceptance Criteria
- ERD and migration plan approved and versioned.
- New org can be created and fully provisioned via migration flow.
- Restore test proves RPO/RTO targets are met.
- Sync log shows no orphan/conflicting records after batch apply.
