# Atithi — Enterprise HMS dashboard

Responsive, buildless HTML/CSS/JavaScript dashboard. Open `dist/index.html` or serve `dist` with a static HTTP server.

Implemented: overview, revenue period switch, guest activity tabs, searchable reservations, new reservation validation, check-in/out, room status filters, housekeeping updates, CSV exports, local activity history and module previews. Demo changes persist in browser localStorage. No real guest or payment data is included.

Scope analysis: the brief says 24 weeks but lists 24 days. The Reports view maps the seven phases onto a proposed 24-week delivery plan. Production needs authenticated multi-property APIs, PostgreSQL transactions, double-entry accounting, effective-dated tax/payroll rules reviewed by specialists, provider credentials/webhooks, idempotent payments, immutable server audit storage and privacy controls. Settlement timing must be provider-configured. Gateway, FRRO, KYC, messaging and statutory filing integrations are not implemented or represented as connected. Dashboard financial figures are illustrative; this frontend is not a certified accounting or compliance system.
