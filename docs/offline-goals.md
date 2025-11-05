# Offline Mode Goals

## Objectives
- Operate fully on local LAN without internet.
- Store data in local SQLite or on-prem PostgreSQL.
- Queue all write operations and auto-sync to cloud when internet returns.
- Support multi-user on LAN with role-based access.
- Provide real-time LAN notifications and graceful auto-updates.

## Scope
- Local auth (cached tokens or local user table) with org_id.
- Local DB for users, inventory, orders, sync_log, error_log.
- Background sync agent (upload/download) with retry and backoff.
- Conflict resolution: latest-write-wins (configurable per entity later).
- Offline encryption at rest for sensitive fields.

Out of scope for MVP:
- Per-field merge strategies beyond latest-write-wins.
- Complex analytics offline (computed in cloud).

## Success Metrics (KPIs)
- ≥ 99.9% offline app uptime on supported OS.
- 0 data loss after reconnect; ≥ 99.5% sync success per batch.
- Mean time to sync (MTTS) after reconnect ≤ 30s for 1K records.
- LAN notification latency p95 ≤ 300ms.
- Auto-update success rate ≥ 98%.

## Milestones
1) Local datastore + models (users, inventory, orders, sync_log).
2) Write-ahead queue with durable persistence and retry policy.
3) LAN service discovery + broadcast notifications.
4) Sync agent (upload/download, pagination, checkpoints, ETags).
5) Local encryption + key management.
6) Auto-updater integration with rollback.
7) Observability: local logs, error codes, health dashboard.

## Acceptance Criteria
- App runs without internet and supports CRUD for inventory/orders.
- New records appear in cloud within 1 minute of connectivity restoration.
- Conflicts are detected and resolved deterministically; audit trail kept.
- Offline-only errors are captured with error codes and uploaded after sync.
- Installers for Windows/Linux with silent update channel.
