# HMS backend

Node.js + Express + MongoDB. This folder has its own package.json, package-lock.json and node_modules; there is no root workspace or root package.

## Install and run

```powershell
cd D:\HMS\backend
npm.cmd ci
# Terminal 1: start the persistent local MongoDB replica set
npm.cmd run db:local
# Terminal 2, also inside backend:
npm.cmd run dev
```

API: http://127.0.0.1:4000. To run without watch mode use `npm.cmd start`. On the first application visit create your administrator account. No default password is seeded.

Copy `.env.example` to `.env` to configure `MONGODB_URI`, `MONGODB_DB`, `PORT`, `HOST`, `COOKIE_SECURE`, and `SERVE_DEMO_DATA`. MongoDB Atlas or a replica set is required for transactions. Local development MongoDB is bound to loopback without authentication; configure proper credentials/TLS before deployment.

## Layout

```text
backend/
  src/                 Express API, authentication, validation, MongoDB
  scripts/             Local MongoDB startup and legacy-data importer
  tests/               API/concurrency and full-stack browser tests
  data/                Persistent MongoDB files, binary cache and legacy backup (ignored)
  test-results/        Browser screenshots (ignored)
  node_modules/        Backend dependencies (ignored)
  .env.example
  package.json
  package-lock.json
```

The production server serves `../frontend/build/` after the frontend build. In development, React runs separately on 5173 and proxies `/api` to this backend.

## Tests

```powershell
npm.cmd test
# Build frontend first, then run from backend:
npm.cmd run test:browser
```

Tests run against isolated real MongoDB replica sets. Coverage includes sessions, permissions, CSRF, room overlap, payment idempotency, balance settlement, stock limits, payroll uniqueness, balanced journals, persistence, concurrent writes and rollback. Browser tests additionally cover guest lifecycle, module navigation, mobile layouts and CSV exports.

## Data and scope

- MongoDB data: `data/mongodb/`. Binary cache: `data/mongodb-binaries/`. Existing records were preserved when reorganizing the project.
- Collections store users, sessions, rooms, reservations, charges, payments, journal, inventory, movements, employees, payroll, messages, audit and settings.
- Numeric public IDs, unique indexes, session TTL, snapshot transactions and a per-property write lock protect core workflows.
- Passwords use scrypt; sessions use HTTP-only cookies; write requests require CSRF verification. API permissions distinguish admin, frontdesk, housekeeping, accountant and HR.
- Money is stored as integer paise. Journals balance per transaction; hash-chained audit records are append-only through the application repository, not externally immutable storage.
- This is a local single-property foundation. Configurable tax is an evaluation rate, not automated GST legal compliance. Payroll deductions are manually reviewed. Live payment gateways, refunds, government filings, KYC, channel managers and outbound messaging are not connected.
- Account recovery/deactivation, multi-property tenancy, deployment hardening, load testing and privacy/retention workflows remain pending.

Legacy SQLite is used only by the optional read-only importer: `npm.cmd run db:import-sqlite`. It refuses a nonempty MongoDB target. The current API uses MongoDB exclusively. Keep backups; use MongoDB backup tools or Atlas snapshots and verify restores.
