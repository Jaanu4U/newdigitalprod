# Digitalchain Supplychain Architecture (Offline + Online)

## Overview

This project provides a **hybrid supply chain management system** that runs both **offline (LAN-based)** and **online (cloud-connected)**. It is designed for organizations that require real-time data synchronization, high security, and modular access based on role, subscription, and organization ID.

---

## Related Goal Documents

- Offline Mode Goals: [docs/offline-goals.md](docs/offline-goals.md)
- Online (Cloud) Goals: [docs/online-goals.md](docs/online-goals.md)
- Database Goals: [docs/database-goals.md](docs/database-goals.md)
- Whitelisted Mobile Apps Goals: [docs/whitelisted-mobile-apps-goals.md](docs/whitelisted-mobile-apps-goals.md)
 - Admin Portal Goals: [docs/admin-portal-goals.md](docs/admin-portal-goals.md)
 - Organizations & Users Goals: [docs/organization-users-goals.md](docs/organization-users-goals.md)
   - Users: List & Responsibilities: [docs/organization-users-responsibilities.md](docs/organization-users-responsibilities.md)
   - Rider Android App: [docs/rider-android-app.md](docs/rider-android-app.md)

---

## 1. Application Modes

### **Offline Mode (Local LAN)**

* Runs completely within a **local intranet (LAN)**.
* Uses **SQLite** or **PostgreSQL (local instance)** for local storage.
* Auto-syncs with cloud when internet becomes available.
* Each organization has a **unique access key or organization ID**.
* Multi-user access through **LAN sync**.
* Auto-updater for new releases.

**Features:**

* Data stored in local DB when offline.
* Queued API transactions to be synced later.
* Real-time LAN notifications.
* Role-based dashboard (Admin, Manager, Staff, Supplier, Customer).

### **Online Mode (Cloud)**

* Connects to the **central PostgreSQL cloud database**.
* Handles authentication, subscription checks, and centralized reports.
* Secure API communication via HTTPS with token-based authentication.
* Each organization’s data partitioned using `org_id`.

**Cloud Features:**

* Multi-tenant DB design.
* Role and permission-based dashboards.
* Centralized reporting and analytics.
* Cloud backup and recovery.

---

## 2. Architecture Overview

### **Frontend Technologies:**

* **Framework:** React (TypeScript)
* **UI Library:** Tailwind CSS + shadcn/ui
* **Offline Cache:** IndexedDB + Service Workers
* **State Management:** Redux Toolkit / Zustand
* **Packaging:** Electron (for desktop offline client)

### **Backend Technologies:**

* **API Framework:** FastAPI (Python) or Node.js (NestJS)
* **Database:** PostgreSQL (Cloud) + SQLite (Local offline)
* **Sync Layer:** Custom sync agent (background worker using WebSocket + CRON)
* **ORM:** SQLAlchemy (Python) / Prisma (Node.js)

---

## 3. API Structure

### Base URL

```
https://api.digitalchain.in/v1/
```

### Core Endpoints

| Function              | Method | Endpoint          |
| --------------------- | ------ | ----------------- |
| Register Organization | POST   | /org/register     |
| Login                 | POST   | /auth/login       |
| Sync Data             | POST   | /sync/upload      |
| Download Data         | GET    | /sync/download    |
| Get Role Dashboard    | GET    | /dashboard/{role} |
| Update Inventory      | POST   | /inventory/update |
| Fetch Reports         | GET    | /reports          |

### Security

* Token-based authentication (JWT)
* HTTPS enforced
* Organization-level isolation via `org_id`

---

## 4. Database Design (Simplified)

### Tables

1. **organizations** — stores `org_id`, `access_key`, subscription details
2. **users** — stores user details linked to `org_id`
3. **roles** — defines role permissions
4. **inventory** — product and stock info
5. **orders** — sales and purchase records
6. **sync_log** — for offline → online synchronization tracking
7. **error_codes** — standard error registry for app-level validation

### Offline Database (SQLite)

* Mirrors critical tables (users, inventory, orders, sync_log)
* Sync agent merges differences based on timestamp and version control

---

## 5. Error Handling System

Each error has a unique code and is logged both locally and on cloud:

```
E1001 - Network unavailable
E1002 - Sync failed (no connection)
E2001 - Unauthorized access
E3001 - Data version conflict
E4001 - Invalid subscription
```

Offline logs are stored in `error_log` and uploaded on next sync.

---

## 6. Future-ready Extension Packages

| Package       | Description                           |
| ------------- | ------------------------------------- |
| `pkg_core`    | Core inventory + order flow           |
| `pkg_finance` | Billing, tax & ledger management      |
| `pkg_hrm`     | Employee, payroll, attendance         |
| `pkg_crm`     | Customer relationship module          |
| `pkg_ai`      | Predictive analytics + AI suggestions |

Each package is enabled by subscription and checked through `org_id`.

---

## 7. Offline Setup Workflow

1. User downloads installer (Windows/Linux Electron app).
2. During installation:

   * Creates local SQLite DB.
   * Sets `org_id` and `access_key` (after online registration).
3. App runs fully offline.
4. When internet is available → background sync starts automatically.

---

## 8. Online Registration Flow

1. Admin registers organization at `portal.digitalchain.in/register`.
2. System generates `org_id` and `access_key`.
3. The offline app uses this key during setup.
4. Cloud verifies subscription and activates sync permissions.

---

## 9. Developer Integration for AI

* Integrate **ChatGPT-5 AI assistant** for:

  * Automated data analysis & suggestions.
  * Predictive supply needs.
  * Error diagnostics.
* Use OpenAI SDK (Python or Node.js) to embed AI assistant inside dashboard.

---

## 10. AI-Driven Data Insights and Security

### AI-Powered Features

* **Demand Forecasting:** Predict inventory requirements using AI models trained on sales trends.
* **Anomaly Detection:** Identify irregular transactions or data anomalies across suppliers.
* **AI Assistant (ChatGPT-5):** Integrated within the dashboard for quick help, data queries, and natural-language analytics.

### Security and Data Isolation

* Every organization is assigned a unique `org_id`.
* Each `org_id` maps to its own schema in PostgreSQL for data separation.
* Data encryption using AES-256 and hashing for sensitive fields.
* Multi-layer JWT authentication with refresh tokens.
* Offline data encrypted before sync.

---

## 11. Cloud Sync and Data Merge Logic

* Offline sync agent pushes queued data using timestamp-based merge.
* Conflict resolution: latest modified record wins.
* Sync logs maintained for each transaction (upload/download).
* Background service monitors connection and triggers auto-sync when internet is detected.

**Sync Example Flow:**

1. User updates inventory offline.
2. Sync agent detects internet → compares last sync timestamp.
3. Uploads new records to `/sync/upload`.
4. Downloads updated records via `/sync/download`.

---

## 12. Deployment Strategy

### Offline Client (Desktop)

* Distributed via Electron installer (.exe / .AppImage).
* Includes auto-updater module for version checks.

### Cloud Backend

* Hosted on VPS with Docker + Nginx.
* PostgreSQL database isolated per organization schema.
* API gateway handles traffic routing and authentication.

---

## 13. Next Steps

1. Prepare separate documents for:

   * Offline setup & LAN architecture.
   * Online sync & cloud APIs.
   * Database ERD and schema migrations.
2. Define version control & deployment automation.
3. Document AI model training pipeline for predictive analytics.

---

**End of Document — Digitalchain Supplychain System (Offline + Cloud Integration)**
