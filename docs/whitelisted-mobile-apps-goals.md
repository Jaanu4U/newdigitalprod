# Whitelisted Mobile Apps Goals

## Objectives
- Allow only approved (whitelisted) mobile apps/devices to access APIs.
- Enforce device/app integrity checks (attestation) and anti-tamper.
- Provide secure offline storage and background sync on mobile.
- Limit features and data exposure per role and subscription.

## Scope
- Device registry service (per org_id + device_id binding).
- App attestation: Google Play Integrity / Apple DeviceCheck / SafetyNet (fallback).
- OAuth2/OIDC with PKCE; token binding to device record.
- Certificate pinning; TLS-only; rotating client secrets where applicable.
- Background sync policy: size limits, frequency caps, metered network awareness.
- Push notifications (FCM/APNs) for sync nudges and alerts.

Out of scope for MVP:
- BYOD MDM integration (can be a later enterprise feature).
- Full offline-first mobile modules (start with limited offline forms and cache).

## Security Controls
- Jailbreak/root detection and debugger/emulator detection.
- Runtime integrity checks; obfuscation and anti-tamper.
- API-level allowlist by device_id + app version + org_id.
- Scope-limited tokens; per-route RBAC.
- Rate limit per device and per org; anomaly detection.

## KPIs
- 0 unauthorized API calls from non-whitelisted apps/devices.
- ≥ 95% attestation success on healthy devices.
- Crash-free sessions ≥ 99.5%; p95 sync time ≤ 10s for typical payloads.
- Security findings remediated within SLA.

## Milestones
1) Device registry API and admin UI (enroll, revoke, rotate).
2) Mobile SDK integration for attestation + secure storage.
3) Token binding and certificate pinning rollout.
4) Background sync with backoff and payload limits.
5) Push notifications pipeline (FCM/APNs) with topic routing by org.
6) Telemetry dashboards: adoption, failures, anomalies.

## Acceptance Criteria
- Only enrolled devices with valid attestation can receive tokens.
- Revoked devices are blocked within 5 minutes system-wide.
- Captured telemetry identifies jailbreak/root attempts reliably.
- Background sync operates within policy and respects metered connections.
