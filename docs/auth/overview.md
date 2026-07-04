# Auth — clientless usage

> This doc covers client-facing HTTP flows. For how _this repo's own routes_
> check a session (the `auth: true` macro, `user`/`session` in handlers), see
> [backend-usage.md](./backend-usage.md).

This backend uses [Better Auth](https://better-auth.com), mounted at `/v1/auth/*`
(see `src/utils/auth.ts`, `src/routes/auth/index.ts`). The `better-auth` client SDK
is optional — it's a typed fetch wrapper. Since this backend serves two separate
frontends (`cufirstdate2026.com`, `rpkm2026.com`) that may not want the SDK
dependency, every flow below works with plain HTTP.

Full endpoint list (paths, request/response schemas) is live at `/openapi`
(Scalar UI) — the Better Auth schema is merged into the same doc as the rest of
the API (tag: **Better Auth**).

## API endpoint

Single shared host, path-namespaced per project:

```
https://api.rpkm2026.com/v1/<project or auth>/...
```

| Prefix       | Routes                                        | Source                                       |
| ------------ | --------------------------------------------- | -------------------------------------------- |
| `/v1/auth/*` | Better Auth (sign-in, session, sign-out, ...) | `src/utils/auth.ts` (`basePath: "/v1/auth"`) |
| `/v1/fd/*`   | First Date project routes                     | `src/routes/firstdate`                       |
| `/v1/rpkm/*` | RPKM project routes                           | `src/routes/rpkm`                            |
| `/v1/health` | Health check                                  | `src/routes/health.ts`                       |

Both frontends (`cufirstdate2026.com`, `rpkm2026.com`) call the same host and
pick their own `/v1/<project>` namespace — auth is shared/common across both,
not per-project.

## Session transport: cookie vs bearer

Better Auth is configured with the `bearer()` plugin, so callers get a choice:

| Mode   | How                                                                                                           | Use when                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Cookie | Browser sends/receives `Set-Cookie` automatically                                                             | Frontend on a real browser origin, same-site or CORS+credentials    |
| Bearer | Read `set-auth-token` response header on sign-in, replay as `Authorization: Bearer <token>` on later requests | No cookie jar (native app, server-to-server, cross-site edge cases) |

For browser callers hitting cookies, requests must include `credentials: "include"`
and the calling origin must be in `trustedOrigins` (see below) or the request is
rejected by Better Auth's CSRF/origin check.

## Required server config for two frontends

`src/utils/auth.ts` must whitelist both frontend origins, or cross-origin
requests from either site will fail the built-in origin check:

```ts
export const auth = betterAuth({
  // ...
  trustedOrigins: [
    "https://cufirstdate2026.com",
    "https://rpkm2026.com",
    ...(env.NODE_ENV !== "production"
      ? ["http://localhost:*", "https://*.cufirstdate2026.com", "https://*.rpkm2026.com"]
      : [])
  ]
});
```

Non-production (`NODE_ENV !== "production"`) also trusts `localhost:*` (any port,
local dev) and wildcard subdomains of both frontend domains (PR/preview deploys).
These are dropped in production — only the two exact root domains are trusted.

If a frontend calls from a subdomain (e.g. `app.rpkm2026.com`), add it explicitly
or use `advanced.crossSubDomainCookies` if cookies need to be shared across
subdomains of the same registrable domain. Cookies are **not** shared across the
two unrelated domains — each frontend gets its own session/cookie, tied to
whichever origin it authenticated from.

## Flow 1 — Google sign-in (browser, cookie mode)

1. Frontend calls:
   ```
   POST /v1/auth/sign-in/social
   Content-Type: application/json

   { "provider": "google", "callbackURL": "https://cufirstdate2026.com/dashboard" }
   ```
2. Response body has a `url` — redirect the browser there (Google's consent screen).
3. Google redirects back to Better Auth's callback: `GET /v1/auth/callback/google?code=...`
4. Better Auth exchanges the code, creates/links the `user`+`account`+`session` rows
   (via the Drizzle adapter → Postgres), sets the session cookie, then 302s the
   browser to the `callbackURL` from step 1.
5. Frontend is now logged in — cookie is attached automatically on subsequent
   fetches to this backend (`credentials: "include"`).

No client SDK needed — steps 1 and 3 are plain `fetch`/redirect, no JS state.

## Flow 2 — checking / using a session

```
GET /v1/auth/get-session
Cookie: better-auth.session_token=...          (cookie mode)
Authorization: Bearer <token>                   (bearer mode)
```

Returns `{ user, session }` or `null`. Server-side route handlers do the same via
`auth.api.getSession({ headers })` — see the `auth` macro in
`src/routes/auth/index.ts`, applied to any route via `.get(..., { auth: true })`.

## Flow 3 — sign out

```
POST /v1/auth/sign-out
```

Cookie or bearer token attached as above. Clears server-side session; frontend
should also drop any locally-cached token.

## Email restriction hook

Two separate guards, one per flow:

- **Email/password** (`emailAndPassword.enabled: false`, currently disabled):
  `src/utils/auth.ts` has a `hooks.before` guard — any auth request whose body
  includes an `email` field must end in `@student.chula.ac.th`, or it's
  rejected with `400 BAD_REQUEST`.
- **Google sign-in**: `socialProviders.google.hd: "chula.ac.th"` restricts to
  the Chula Google Workspace domain. Sent as the `hd` authorization hint (so
  Google's account chooser itself narrows to `@chula.ac.th` accounts) and
  re-verified against the returned id token's `hd` claim — personal
  `@gmail.com` accounts are rejected even if hand-picked at the consent
  screen. Note this allows all of `chula.ac.th`, not just the
  `student.chula.ac.th` subset the email/password guard enforces; narrow
  further in `databaseHooks.user.create.before` if only students (not staff)
  should be able to sign in with Google.

See [google-flow.md](./google-flow.md) for the full sequence diagram.
