# Security policy — DHS e-Report

## Reporting a vulnerability

Do not publish student data, credentials, session tokens, database URLs, or a working exploit in a public issue. Contact the repository owner privately and include the affected route, impact, reproduction steps using synthetic data, and a suggested mitigation.

## Production release gate

This application handles children's academic records and family contact details. A successful deployment is not proof of production security. Before enabling real school data, the operator must verify:

- Every API route and Socket.IO event enforces server-side role and record ownership checks.
- Sessions are stored in a shared, durable session store if more than one process/instance can serve requests; process-memory sessions are not suitable for horizontal scaling and are lost on restart.
- All school records are scoped by a server-verified tenant ID before multi-school sales. Tenant identifiers must be applied to reads, writes, exports, imports, invoices, sessions, and realtime events.
- Writes use database transactions and targeted updates rather than replacing an entire shared ledger from a potentially stale in-memory snapshot.
- Production data is not committed to Git and is never served as static content.
- Database backups and a restore drill are documented; retention and access are restricted.
- AI imports are reviewed before committing records, use synthetic test fixtures in CI, and never send unnecessary sensitive data to a model provider.
- Parent email delivery is disabled until recipient addresses are verified and the school authorizes the workflow.
- Dependency audit findings are reviewed and resolved, not merely suppressed.
- A restrictive Content Security Policy is introduced after inline scripts/styles are migrated or protected with nonces; enabling a blanket policy before that migration may break the existing UI.
- Authentication, authorization, tenant isolation, file uploads, rate limits, session expiry, PDF exports, and concurrent writes are tested before release.

## Known limitations to resolve before commercial multi-school use

The current architecture contains in-memory sessions and cached full-record collections. Its persistence layer rewrites a collection from a snapshot, which can lose concurrent changes or diverge between multiple app instances. The current schema also does not yet establish tenant IDs consistently across student, staff, DOSA, invoice, and realtime paths. These are release blockers for a commercial multi-tenant service and require a coordinated migration, not only a UI change.

## Handling secrets

Keep DATABASE_URL, DHS_DEVELOPER_PIN, AI provider keys, SMTP credentials, and any session signing secrets in Render's environment settings. Rotate any secret that has been exposed. Do not copy real credentials into GitHub issues or chat.
