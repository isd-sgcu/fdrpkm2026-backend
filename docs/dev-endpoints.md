# Dev endpoints — test personas, impersonation, seeding

Dev-only tooling under `/v1/dev/*` (`src/routes/dev.ts`) so the frontends can
test as any user **without going through Google SSO**: create test personas,
impersonate them with one request, and seed baseline fixture data on an empty
database. Built for a frontend "dev mode" banner, but everything is plain
HTTP and curl-able.

## Availability & auth

Two gates:

1. **`NODE_ENV=development`** — the routes are only mounted in development
   (`src/routes/index.ts`). In production every `/v1/dev/*` path 404s.
2. **`x-dev-key` header** — every route except the `GET /v1/dev` ping must
   send `x-dev-key: <DEV_API_KEY>`. This exists because **staging also runs
   in development mode on a public URL** — the env check alone would let
   anyone on the internet mint a session as any student. No `DEV_API_KEY`
   configured = every call rejected (fail closed).

```bash
# .env
DEV_API_KEY=pick-a-long-random-string   # share with the frontend team
```

## Endpoints

All under the `/v1/dev` prefix. Also listed in the Scalar docs at `/openapi`
under the **Dev** tag.

### `GET /v1/dev` — dev-mode probe

No auth. Returns `{ success: true, data: { devMode: true } }` in development,
404 in production. The frontend banner probes this to decide whether to render.

### `POST /v1/dev/admin/users` — create a test persona

Creates the better-auth `user` row (Google SSO bypassed, email is always
`<studentId>@student.chula.ac.th`) **and** the domain `students` row, optionally
registered for projects. Idempotent — re-posting the same `studentId` updates
the profile instead of failing.

```bash
curl -X POST http://localhost:3000/v1/dev/admin/users \
  -H "x-dev-key: $DEV_API_KEY" -H "content-type: application/json" \
  -d '{
    "studentId": "6912345678",
    "firstName": "Somchai",
    "lastName": "Test",
    "role": "student",
    "registrations": [{ "project": "rpkm" }, { "project": "firstdate" }]
  }'
```

Body fields:

| Field                                 | Notes                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studentId`                           | 10 chars, becomes the email + QR payload. `69…` = freshman.                                                                                                                                                                                  |
| `firstName` / `lastName` / `nickname` | Optional, default `Dev` / `<studentId>`.                                                                                                                                                                                                     |
| `role`                                | `student` (default) or `staff`.                                                                                                                                                                                                              |
| `registrations`                       | Array of `{ project, staffRole?, withGroup? }`. `project`: `firstdate` \| `rpkm`. `staffRole`: `firstdate` \| `rpkm` \| `walkrally` \| `freshmennight`. rpkm registrations get a solo group like the real flow (`withGroup: false` to skip). |

### `POST /v1/dev/impersonate` — become that user

Mints a **real** better-auth session for the persona (auto-creating a minimal
one if the `studentId` is unknown). The response both **sets the session
cookie** and **returns the signed token** — pick whichever fits:

```bash
curl -X POST http://localhost:3000/v1/dev/impersonate \
  -H "x-dev-key: $DEV_API_KEY" -H "content-type: application/json" \
  -d '{ "studentId": "6912345678" }'
```

```json
{
  "success": true,
  "data": {
    "studentId": "6912345678",
    "token": "…signed session token…",
    "expiresAt": "2026-07-22T12:32:26.422Z",
    "cookieName": "better-auth.session_token",
    "userCreated": false
  }
}
```

- **Cookie mode** (recommended — identical to a real login): call with
  `credentials: "include"`, then reload. The `Set-Cookie` on the response is
  the exact name/attributes better-auth uses.
- **Bearer mode**: store `data.token`, send `Authorization: Bearer <token>`
  on every request (the bearer plugin is enabled).

Either way the session goes through the **unmodified** better-auth validation
path — `GET /v1/auth/get-session` and every route using the `auth` macro
accept it with zero special-casing. Impersonating again just replaces the
session; no sign-out needed between switches.

### `GET /v1/dev/users` — list personas

For the banner's user picker. Returns every `students` row with its
registrations (`project`, `staffRole`, `groupId`).

```bash
curl http://localhost:3000/v1/dev/users -H "x-dev-key: $DEV_API_KEY"
```

### `DELETE /v1/dev/admin/users/:studentId` — wipe a persona

Deletes everything: auth user (+ sessions/accounts via cascade), `students`
row, registrations (+ travel legs), groups the student leads (members'
`groupId` goes null), scans, entries, walk-rally rows. Use to recreate a
persona from a clean slate.

```bash
curl -X DELETE http://localhost:3000/v1/dev/admin/users/6912345678 \
  -H "x-dev-key: $DEV_API_KEY"
```

### `POST /v1/dev/seed` — baseline fixtures

Empty local DB → usable app: 22 houses, the 8 walk-rally activities
(3 workshops, 4 museums, 1 minigame), 6 game checkpoints (3 jigsaw, 3 csr).
Idempotent — existing codes are skipped, response reports how many rows were
actually inserted.

```bash
curl -X POST http://localhost:3000/v1/dev/seed \
  -H "x-dev-key: $DEV_API_KEY" -H "content-type: application/json" -d '{}'
```

> **Placeholder codes.** House/checkpoint names live in the frontend i18n,
> keyed by `code` — the defaults here (`house_01`…, `jigsaw_1`…, `workshop_1`…)
> are placeholders except `cu_museum`, which is real (special-cased round
> schedule). Once the frontend's codes are fixed, pass them in the body:

```json
{
  "houses": ["house_alpha", "house_beta"],
  "activities": [{ "code": "cu_museum", "kind": "museum" }],
  "checkpoints": [{ "game": "jigsaw", "code": "jw_lib", "lat": 13.74, "lng": 100.53 }]
}
```

## Frontend dev-banner recipe

1. On app load, probe `GET /v1/dev`. 200 → render the banner; anything else →
   dev mode off, render nothing.
2. Ask for the dev key once, keep it in `localStorage`, send it as `x-dev-key`
   on every `/v1/dev/*` call.
3. Populate a user picker from `GET /v1/dev/users`; a "new persona" form posts
   `POST /v1/dev/admin/users` (preset buttons — "fresh student", "rpkm staff",
   "walkrally staff" — are one-liners over the same endpoint).
4. On pick: `POST /v1/dev/impersonate` with `credentials: "include"`, then
   `location.reload()`. The app now sees that user everywhere.
5. Optional: "reset" button = `DELETE /v1/dev/admin/users/:studentId` +
   re-create.

## How impersonation works (backend notes)

No middleware is stubbed and `getSession()` is untouched. The endpoint uses
better-auth's internal adapter (`auth.$context.internalAdapter`) to
find-or-create the user and insert a real session row, then signs the token
the same way better-auth's cookie layer does
(`token.makeSignature(token, secret)` from `better-auth/crypto`) — the same
technique better-auth's own `test-utils` plugin uses. That one signed value
works both as the session cookie and as a bearer token.

Creating users through the internal adapter also bypasses the sign-in request
hooks (Google-only provider, `@student.chula.ac.th` domain check) — which is
the point: those hooks guard the public sign-in endpoints, not trusted
server-side code.
