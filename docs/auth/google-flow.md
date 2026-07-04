# Google sign-in — sequence diagram

Two frontends (`cufirstdate2026.com`, `rpkm2026.com`) share one Better Auth
backend. Google OAuth app config must list this backend's `/v1/auth/callback/google`
as an authorized redirect URI (one backend, one Google client, works for both
frontends since the return trip goes through the shared backend, not Google
directly to the frontend).

```mermaid
sequenceDiagram
    actor U as User (browser)
    participant FE as Frontend<br/>(cufirstdate2026.com or rpkm2026.com)
    participant BE as Backend<br/>Better Auth (/v1/auth/*)
    participant DB as Postgres<br/>(user/account/session)
    participant G as Google OAuth

    U->>FE: Click "Sign in with Google"
    FE->>BE: POST /v1/auth/sign-in/social<br/>{ provider: "google", callbackURL }
    BE-->>FE: 200 { url: accounts.google.com/... }
    FE->>U: redirect to url
    U->>G: GET accounts.google.com/o/oauth2/...
    G->>U: consent screen
    U->>G: approve
    G->>BE: GET /v1/auth/callback/google?code=...&state=...
    BE->>G: exchange code for tokens
    G-->>BE: access_token, id_token (email, profile)
    BE->>DB: upsert user + account,<br/>create session row
    DB-->>BE: user, session
    BE-->>U: 302 redirect to callbackURL<br/>Set-Cookie: better-auth.session_token=...<br/>(or header set-auth-token if bearer() reads it)
    U->>FE: browser lands on callbackURL, cookie attached
    FE->>BE: GET /v1/auth/get-session<br/>Cookie: better-auth.session_token=...
    BE->>DB: look up session
    DB-->>BE: session + user
    BE-->>FE: 200 { user, session }
```

## Notes

- **Cross-origin cookies**: since the callback's final redirect lands back on
  the frontend's own origin, and the frontend then calls the backend
  cross-origin for `/get-session`, the cookie must be sent with
  `credentials: "include"`, and the frontend's origin must be in
  `trustedOrigins` on the backend (see [overview.md](./overview.md)).
- **Bearer alternative**: if cookies are unusable (e.g. no reliable third-party
  cookie support), read `set-auth-token` from the redirect response headers
  instead and store it client-side, then send `Authorization: Bearer <token>`
  on later requests. Requires `bearer()` plugin (already enabled).
- **Account linking**: same Google account signing into both
  `cufirstdate2026.com` and `rpkm2026.com` flows creates two independent
  `session` rows against the same `user`/`account` row — the user identity
  is shared, sessions are per-origin.
