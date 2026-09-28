# GazeCore auth service

The backend currently provides Better Auth, API-key management, CORS, email verification, health checks, and auth OpenAPI documentation. Eye tracking runs in the browser on `/trial`; this service does not receive camera frames or tracking results.

## Configure

Copy `.env.example` to `.env` and set the required Better Auth secret, PostgreSQL connection string, Google OAuth credentials, and Resend key. Use the callback URL configured in Google Cloud:

```text
http://localhost:4000/api/auth/callback/google
```

Set `FRONTEND_URL` to the frontend origin. The service also trusts the local frontend origins used for development. Keep real credentials in the ignored `.env` file and out of commits.

## Run

```bash
bun install
bun run dev
```

The service listens on port `4000` by default. Set `PORT` to override it. Check `/health` for service status and `/swagger` for the auth API documentation.

## Retained data

PostgreSQL stores Better Auth users, sessions, OAuth accounts, verification records, and API keys. The eye-tracking flow does not store data in this database.

## Checks

```bash
bun test
bun run typecheck
bun run build
```
