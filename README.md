# Digitalchain Monorepo

This repo contains the Digitalchain hybrid supply chain system with offline and online components.

## Structure
- docs/ — Architecture and goal documents
- backend/ — FastAPI backend starter
- admin-portal/ — Next.js admin portal skeleton
- rider-android/ — Rider Android app starter (Kotlin + Compose)

## Backend (FastAPI)
- Setup: `pip install -r backend/requirements.txt`
- Run: `uvicorn app.main:app --reload --port 8000 --app-dir backend`
- Health: http://localhost:8000/v1/health
- Endpoints: see backend/README.md and docs

## Admin Portal (Next.js)
- Open in Node 18+: `cd admin-portal && npm install && npm run dev`

## Rider Android
- Open `rider-android/` in Android Studio; run the `app` module
- Configure BASE_URL in `app/build.gradle.kts` if needed

## Database
- Local Postgres: `docker compose up -d db`
- Configure `DATABASE_URL` in `.env` (see `.env.example`)

## Docs to read next
- docs/project.md
- docs/online-goals.md, docs/offline-goals.md
- docs/admin-portal-goals.md
- docs/organization-users-goals.md and docs/organization-users-responsibilities.md
- docs/rider-android-app.md
