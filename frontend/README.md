# HMS frontend

React + Vite. This folder has its own dependencies and lockfile; no parent package is needed.

```powershell
cd D:\HMS\frontend
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173. Start the backend separately on port 4000. Vite proxies `/api` to the backend, preserving same-origin cookie authentication.

## Layout

```text
frontend/
  src/                React shell, module pages, forms, API client, styles
  build/              Generated production output (ignored)
  node_modules/       Frontend dependencies (ignored)
  index.html
  vite.config.js
  package.json
  package-lock.json
```

`npm.cmd run build` generates `build/`. The backend serves that directory at http://127.0.0.1:4000. `npm.cmd run preview` previews static assets only; use the backend for complete application behavior.

MongoDB URIs and secrets belong only in `backend/.env`, never in the frontend.
