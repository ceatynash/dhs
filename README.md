# Daramombe High School Portal

Official Daramombe High School Portal for parents/guardians, teachers, school administration, DOSA, and authorized developers.

## Google Sign-In setup

1. In Google Cloud Console, create/select a project and configure the OAuth consent screen.
2. Create an OAuth client ID of type **Web application**.
3. Add the deployed Render origin (for example, `https://e-report-pgrn.onrender.com`) to **Authorized JavaScript origins**. Add `http://localhost:3000` for local development.
4. Set `GOOGLE_CLIENT_ID` on Render to the web client ID. The frontend and backend use this same value.
5. Set `DEVELOPER_EMAIL` to the exact Google account authorized for Developer access, and set a long random `SESSION_SECRET`.
6. Ensure parent emails in `students.json`, staff emails in `staff.json`, and DOSA emails in `dosa_members.json` match the Google accounts users will sign in with.
7. Deploy and test each role with the exact registered Google account.

Google Sign-In proves control of a Google account. Portal access is granted only after the server verifies the ID token and matches the verified email against the selected role's server-side allowlist. Selecting a role in the browser does not grant that role.

## Run locally

1. Install dependencies with `npm install`.
2. Configure `GOOGLE_CLIENT_ID`, `DEVELOPER_EMAIL`, and `SESSION_SECRET` in the environment.
3. Start the application with `npm start`.

Do not commit credentials, tokens, or real student records to the repository.
