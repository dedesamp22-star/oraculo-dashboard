# Oraculo 0.4 - Homologation Notes

## Current Architecture

Oraculo 0.4 runs as a Vite frontend, an Express API, a SQLite database, and a demo worker in the backend process. The backend is authoritative for all demo account data. Browser localStorage is limited to non-critical visual preferences and compatibility migration input.

Public market data remains read-only through Binance public endpoints proxied by the API. There is no Binance account integration and no route capable of sending real orders.

## Backend Flow

1. The client authenticates through `POST /api/auth/login`.
2. The API verifies the user password with Node native `scrypt`.
3. The API creates a session row and stores only the token hash in SQLite.
4. The browser receives an HTTP-only cookie.
5. Private demo routes read the authenticated `user_id`.
6. Demo account, positions, trades, events, settings, automation and statistics are queried by `user_id`.
7. Critical position changes run inside SQLite transactions.
8. Partial, breakeven, trailing, timeout and final close update the same user-scoped account and history.

## Frontend Flow

1. The app calls `GET /api/auth/me` on startup.
2. If there is no valid session, it renders the login screen.
3. After login, the frontend loads the server demo session.
4. Local demo data is migrated only for the authenticated user.
5. The UI reads account, position, stats and history from the backend.
6. Logout calls `POST /api/auth/logout`, clears the server session and returns to login.

Passwords are never persisted in localStorage.

## Worker Flow

1. The worker reads active users from SQLite.
2. It processes only users whose demo automation setting is enabled.
3. Each user is evaluated independently with its own symbol and settings.
4. Price updates and signals are written with the user's `user_id`.
5. Idempotency keys are scoped by `user_id`, preventing duplicate events across restart and between users.

## Authentication

Users are stored in the `users` table with:

- `id`
- `name`
- `username`
- `password_hash`
- `password_salt`
- `scrypt_n`
- `scrypt_r`
- `scrypt_p`
- `scrypt_key_len`
- `role`
- `active`
- `created_at`
- `updated_at`
- `last_login_at`

Sessions are stored in `auth_sessions` with a token hash only. Logout sets `revoked_at`, so the cookie cannot be reused after logout. Failed login attempts are tracked in `auth_attempts`.

Initial admin creation is controlled by environment variables:

```bash
ORACULO_INITIAL_ADMIN_USERNAME=admin
ORACULO_INITIAL_ADMIN_NAME=Administrador
ORACULO_INITIAL_ADMIN_PASSWORD=<strong password>
```

There is no fixed admin password in code.

## SQLite

The database uses WAL and `busy_timeout`. The 0.4 user-scoped schema includes:

- `users`
- `auth_sessions`
- `auth_attempts`
- `demo_account.user_id`
- `demo_positions.user_id`
- `demo_trades.user_id`
- `demo_events.user_id`
- `app_settings.user_id`

Migration v4 preserves previous global tables as legacy tables where a rebuild is needed:

- `demo_account_legacy_v4`
- `app_settings_legacy_v4`

Existing demo data is assigned to the initial admin user.

## Security Audit

Session fixation:
Login creates a new random session token each time. Tokens are not accepted after logout or expiration.

CSRF:
Cookies use SameSite=Lax. This is acceptable for the current same-site app flow. Before exposing broader cross-site surfaces, add CSRF tokens for state-changing routes.

XSS:
Passwords and tokens are not stored in localStorage. React escapes rendered strings by default. Continue avoiding `dangerouslySetInnerHTML`.

SQL injection:
SQLite access uses prepared statements. Dynamic table names are limited to internal migration helpers.

Cookies:
Session cookie is HTTP-only, SameSite=Lax, Path=/, with Secure enabled when HTTPS is required.

Rate limit:
Basic brute force protection exists through `auth_attempts`. Production should still add external rate limiting at Caddy or an upstream WAF if traffic grows.

User enumeration:
Invalid password and unknown user return the same generic error.

Privilege escalation:
Only an admin session can create users. API responses do not expose hash, salt or tokens.

Protected routes:
All `/api/demo/*` routes require authentication. Binance public market-data routes remain public and read-only.

Environment variables:
Secrets must remain outside Git and deployment packages.

## Roadmap 0.5

- Add an admin UI for user creation and deactivation.
- Add CSRF tokens for all mutating routes.
- Add external rate limiting and login audit reports.
- Add automated Playwright coverage for desktop and mobile login/demo flows.
- Add a dedicated worker process/service split from the API process.
- Add observability dashboard for worker, API, SQLite and Caddy health.
- Add database backup verification and restore drills.

## Deploy Checklist

1. Freeze production writes or choose a low-traffic window.
2. Confirm current production services are healthy.
3. Create a timestamped full app backup.
4. Create a consistent SQLite backup.
5. Confirm the production environment has:
   - `ORACULO_INITIAL_ADMIN_USERNAME`
   - `ORACULO_INITIAL_ADMIN_NAME`
   - `ORACULO_INITIAL_ADMIN_PASSWORD`
   - `ORACULO_SESSION_TTL_SECONDS`
   - `ORACULO_COOKIE_SECURE=true`
   - `ORACULO_REQUIRE_HTTPS=true`
6. Build locally.
7. Upload a release package without secrets, local DBs, node_modules or caches.
8. Extract into a timestamped release.
9. Preserve `shared`, `data`, `config`, logs and backups.
10. Switch symlink atomically.
11. Restart only required services.
12. Validate:
    - `/api/health`
    - login
    - logout
    - account/session load
    - automation toggle
    - demo open/partial/breakeven/trailing/close
    - persistence after service restart
    - second user isolation
    - Binance public routes
13. Monitor logs and resources.

## Rollback Checklist

1. Stop only Oraculo app services if needed.
2. Point `current` symlink back to the previous release.
3. Restore the SQLite backup only if the migration or data validation failed.
4. Keep the failed release for inspection.
5. Restart services.
6. Re-run health, login and demo read tests.
7. Document the failed step before attempting another release.
