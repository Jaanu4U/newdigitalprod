# Digitalchain Admin Portal (Next.js)

Minimal Next.js (App Router) skeleton for the Admin Portal. Includes a basic login form wired to the FastAPI backend.

## Requirements
- Node.js 18+ and npm

## Scripts
- npm install
- npm run dev
- npm run build
- npm run start

## Configure
- API base URL: set `NEXT_PUBLIC_API_BASE` in the environment (e.g., `https://api.digitalchain.in/v1`). If unset, it defaults to `http://localhost:8000/v1/` in development.
- Login form expects: email, password, org_id, and optional device_id (forwarded to backend).
- On success, access and refresh tokens are stored in `localStorage` as `dc_access` and `dc_refresh`.

## Pages
- `/login` — Sign in; persists tokens in localStorage on success.
- `/deliveries` — Lists deliveries for the current org using the API endpoint `GET /v1/rider/deliveries` with `Authorization: Bearer <access>`.

See project docs in `../docs` for features and goals.
