# Rider Android App — Product & API Contract

This document defines the Rider mobile app (Android) used for last‑mile delivery with Google Maps navigation, real‑time status updates, and Proof of Delivery (PoD) capture. It includes app goals, flows, required APIs (URLs), payload shapes, security, offline behavior, and setup inputs we need from you.

## Goals
- Turn‑by‑turn navigation using Google Maps with live ETA.
- Simple delivery workflow: start route → update statuses → capture PoD (signature/photo) → complete.
- Reliable offline queueing: all events are stored and synced when online.
- Secure device/app access via whitelisting and attestation.

## App Flows
1) Login & Device Enrollment
2) Fetch Assigned Deliveries (for today or a time window)
3) Start Route (optional batch start)
4) Navigate to Stop (Google Maps deep link)
5) Update Status (out‑for‑delivery, arrived, delivered, failed)
6) Capture PoD (signature, photos) and notes
7) Background Location Updates (while active)
8) Sync (online) or Queue (offline)

---

## Base URL
- Production: `https://api.digitalchain.in/v1/`
- Staging: `https://staging.api.digitalchain.in/v1/`

All rider endpoints are prefixed with `/rider`.

---

## APIs (URLs) and Contracts

### Auth
- POST `/auth/login`
  - Body: `{ email, password, org_id, device_id, app_version, attestation? }`
  - Response: `{ access_token, refresh_token, user: { user_id, role }, org_id }`
- POST `/auth/refresh`
  - Body: `{ refresh_token, device_id }`
  - Response: `{ access_token }`

### Device Registration & Push
- POST `/rider/devices/register`
  - Body: `{ device_id, org_id, platform: 'android', model, os_version, app_version, fcm_token, integrity_token? }`
  - Response: `{ status: 'ok', enrolled: true }`
- POST `/rider/devices/push-token`
  - Body: `{ device_id, fcm_token }`

### Deliveries
- GET `/rider/deliveries?date=YYYY-MM-DD&status=assigned|in_progress|completed`
  - Response: `{ items: [ { delivery_id, order_id, customer, address, geo: { lat, lng }, eta_window, status } ] }`
- GET `/rider/deliveries/{delivery_id}`
  - Response: `{ delivery: { delivery_id, route_index, address, geo, contact, notes, status, stops? } }`
- POST `/rider/deliveries/{delivery_id}/status`
  - Body: `{ status, timestamp, location: { lat, lng, accuracy? }, note? }`
  - Status enum: `out_for_delivery | arrived | delivered | failed | cancelled`
  - Response: `{ status: 'ok', delivery_id, new_status }`
- POST `/rider/deliveries/{delivery_id}/pod`
  - Multipart or JSON+base64
  - Fields: `signature_image?`, `photos[]?`, `recipient_name?`, `recipient_id?`, `note?`, `timestamp`
  - Response: `{ status: 'ok', pod_id }`

### Location & Telemetry
- POST `/rider/location`
  - Body: `{ device_id, delivery_id?, org_id, points: [ { lat, lng, ts, speed?, heading?, accuracy? } ] }`
  - Batch up to 50 points; drop if older than policy window.
  - Response: `{ status: 'ok' }`

### Notifications
- POST `/rider/ack`
  - Body: `{ notification_id, device_id, ts }`

---

## Request Examples

POST /rider/deliveries/{delivery_id}/status
```
{
  "status": "arrived",
  "timestamp": "2025-11-03T10:21:33Z",
  "location": { "lat": 12.9352, "lng": 77.6245, "accuracy": 8 },
  "note": "Gate locked, called customer"
}
```

POST /rider/deliveries/{delivery_id}/pod (multipart)
- signature_image: file (PNG/JPEG, ≤ 2MB)
- photos[]: up to 3 files (≤ 2MB each)
- recipient_name: string
- recipient_id: string (optional)
- note: string (optional)
- timestamp: ISO string

---

## Security
- Authentication: JWT access/refresh with PKCE on mobile flow.
- Device Binding: tokens scoped to `{org_id, device_id}`; logout on mismatch.
- App Attestation: Google Play Integrity token checked on enroll/login.
- Certificate Pinning: enable in the app for API hosts.
- Scope & RBAC: role `Rider` with minimal permissions.
- Rate Limits: location 1 req/10s; status PoD 1 req/stop; burst allowed within policy.

---

## Offline Behavior
- Local Queue: all POSTs (status, pod, location) are queued if offline.
- Retry Policy: exponential backoff up to 6h; discard stale location points > 24h.
- Conflict Handling: last‑write‑wins on status with server timestamps; PoD idempotency via `Idempotency-Key` header.

---

## Google Maps Integration
- Intent deep link: `google.navigation:q={lat},{lng}&mode=d`
- Alternative: Maps SDK in‑app map for route preview.
- Optional ETA polling using Distance Matrix API (server‑side to keep keys safe).

---

## Data Retention & Privacy
- PoD images retained for `N` days (configure per org), then archived/deleted.
- Location history retained for `M` days (policy), minified after 7 days.
- Users can request their personal data export/deletion via Admin Portal.

---

## What we need from you to configure the Rider app
- Organization details: `org_id`, name, region/timezone.
- Device policy: enrollment method (tokens vs admin approval), max devices per rider.
- Android app identifiers:
  - Package ID (e.g., `in.digitalchain.rider`)
  - Signing cert SHA‑256 fingerprint (for Play Integrity binding)
- Google Cloud project & API keys:
  - Maps SDK for Android, Directions/Routes, Distance Matrix (if ETA polling)
  - Restrict keys to package name + SHA‑256
- Firebase Cloud Messaging (push):
  - Sender ID and server key, or we can provision and share app config
- Branding assets:
  - App name, primary color, logo (PNG/SVG), splash screen background
- PoD policy:
  - Require signature? photos? both? max sizes/counts; retention period
- Location policy:
  - Update frequency (e.g., every 30–60s while active), accuracy trade‑offs, geofencing needs
- Legal links:
  - Privacy Policy and Terms URLs for the app store listing and in‑app links

---

## Non‑functional Requirements
- Performance: cold start < 3s; status update < 300ms p95 when online.
- Reliability: queue persistence across app restarts; zero data loss.
- Battery: balanced location sampling; background updates only when active route.
- Accessibility: large tap targets, voice guidance compatibility.

---

## Future Enhancements
- On‑device OCR for package/barcode verification.
- Dynamic route optimization (server‑side).
- Incident reporting with quick templates and photo capture.
