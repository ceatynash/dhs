# Multi-tenant implementation plan

## Current architecture findings

The current app is a single-school Express + Socket.IO portal. PostgreSQL stores whole JSONB records in `students`, `staff`, and `dosa_members`, while `server.js` loads all rows into process-wide caches. Several write paths replace a whole collection (including `DELETE FROM <table>` followed by reinsert), and Socket.IO events broadcast updates globally. Student `schoolId` is the student's DHS ID, not the school/tenant ID.

These choices are workable for a single school but are unsafe for multiple schools until refactored. Merely adding a school name or filtering the homepage is not tenant isolation.

## Proposed target design

- Use `schools.tenant_id` as the immutable tenant key; retain `students.school_id` as the student-facing DHS ID for compatibility.
- Add `tenant_id` to every school-owned database row, including students, staff, and DOSA members. Future tables for announcements, import drafts/jobs, files, invoices, and audit events must also carry tenant scope.
- Resolve a tenant from a trusted server-side mapping of hostname/subdomain to a school record. Never trust a client-supplied tenant ID as authorization.
- Store `tenantId` in authenticated sessions after checking the account's tenant. School staff accounts must be unique within a tenant, and sign-in must require the tenant context.
- Replace whole-table delete/reinsert writes with targeted parameterized SQL operations scoped by tenant. Avoid process-wide caches as the authority for authorization or writes.
- Use Socket.IO tenant rooms (for example, `tenant:<tenant_id>`) and role-specific events; do not use `io.emit` for school data, staff updates, broadcasts, or forced disconnects.
- Load branding (school name, logo, theme colours) from the resolved tenant record. Support subdomains first, then optional custom domains through a verified hostname mapping.
- Add database row-level security only after the application has a safe, transaction-scoped tenant context. Confirm the app's database role does not bypass RLS; table owners and privileged roles can otherwise bypass policies.
- Keep platform developer administration separate from school administrators. Platform developer actions must be explicit cross-tenant operations; school admins may only manage their own tenant.

## Migration status

`migrations/001_multi_tenant_foundation.sql` is a **schema foundation only**. It creates the school registry and attaches all existing rows to Daramombe High School. It does not yet make the application multi-tenant. Do not run it on production as a claim of readiness, and do not onboard other schools until server routes, authentication, writes, uploads/import jobs, branding, and Socket.IO have all been tenant-scoped and tested.

## Required release gates

1. Back up PostgreSQL and test the migration against a staging copy.
2. Migrate existing DHS data to the `daramombe-high-school` tenant and verify row counts and sign-in.
3. Refactor every read/write route and Socket.IO event to use trusted tenant context.
4. Add automated isolation tests: tenant A cannot read, modify, delete, export, import into, or receive realtime events for tenant B.
5. Test parent/student invoice and mark access, PIN provisioning, staff administration, PDF import and parent notification delivery.
6. Add Row-Level Security policies and test with the exact non-owner database role used by the service.
7. Test subdomain/custom-domain routing and branding, then deploy to staging and run the existing DHS regression checklist before production rollout.

## Security warning

The repository is currently public and the application contains a school portal's source code and JSON seed files. Before using real student records, make the repository private and remove any real student information from tracked files/history where present. Rotate any secrets that were ever committed. Keep `DATABASE_URL`, SMTP credentials, AI API keys, and developer credentials only in Render's environment settings.
