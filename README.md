# Daramombe High School Portal

Official Daramombe High School portal for students, parents/guardians, teachers, school administration, DOSA, and authorized developers.

## DHS-managed sign-in

Google Sign-In is not used. Student and parent accounts use the student's unique DHS ID, the exact registered full name, and a private school-issued PIN. The student and parent role both resolve to that one student's record. The server checks record ownership on every student list and invoice request; changing a URL or ID must not grant access to another student.

- PINs are stored as salted scrypt hashes, never as plaintext.
- Sign-in attempts are rate-limited.
- Teacher and Head/Deputy accounts are provisioned by the portal developer and have separate school-issued PINs.
- Developer access uses `DHS_DEVELOPER_NAME` and `DHS_DEVELOPER_PIN` environment variables in Render.
- Use a unique PIN with at least 8 alphanumeric characters. Share it privately and reset it if exposed.
- Existing student and staff records must have PINs provisioned by the Developer dashboard before they can sign in.
- DOSA accounts need an administrator-provisioned PIN as well.

## Run locally

1. Install dependencies with `npm install`.
2. Set `DHS_DEVELOPER_NAME`, `DHS_DEVELOPER_PIN`, and a long random `SESSION_SECRET` in your environment.
3. Run `npm start`.

## Production privacy requirements

Do not commit real student names, marks, parent contacts, staff credentials, or other school records to a public repository. The current application uses JSON files for its student/staff ledgers; Render's ordinary filesystem is ephemeral, so runtime changes made through the dashboard may be lost during redeploys/restarts unless a persistent data store is configured. Before using this for real student records, make the repository private and move school records and PIN hashes to a persistent private database or properly configured persistent storage. Do not treat authentication alone as a substitute for protecting the underlying data store.

Never commit PINs, hashes, session tokens, or environment secrets.


## PostgreSQL migration

The server now supports PostgreSQL through `DATABASE_URL`. On startup it creates the required tables and, only when a target table is empty, imports the corresponding existing JSON ledger (`students.json`, `staff.json`, and `dosa_members.json`). Marks, embedded invoice/fee data, and PIN hash fields are preserved as JSONB records. After the first import, PostgreSQL is the primary store.

To enable it on Render:
1. Open the `dhs-portal-db` database and copy its **Internal Database URL** from the Connect panel.
2. Open the E-report web service's Environment settings and add `DATABASE_URL` with that value. Do not commit it to GitHub or paste it into chat.
3. Save the environment change and redeploy. Startup logs should say `DHS PostgreSQL ready` and report the loaded student, staff and DOSA counts.
4. Check those counts and test sign-in, marks, invoices, and account PIN resets before inviting families.

Until `DATABASE_URL` is set, the service retains JSON-file fallback mode. Do not treat that as a completed migration. The free Render database is temporary and expires on 14 November 2026; upgrade it before using it for durable school records.
