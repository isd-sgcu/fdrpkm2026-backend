# Auth — backend usage (protecting routes)

`docs/auth/overview.md` covers the client-facing HTTP flows (sign-in, session,
sign-out). This doc is the other side: how a route handler in _this_ repo
checks who's calling.

## The pieces

- `src/utils/auth.ts` — the Better Auth instance (`auth`), mounted at
  `/v1/auth/*`.
- `src/routes/auth/index.ts` — `authMiddleware`, an Elysia plugin exporting
  one **macro** named `auth`:
  ```ts
  export const authMiddleware = new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401, errorResponse("UNAUTHORIZED"));
        return { user: session.user, session: session.session };
      }
    }
  });
  ```
  `resolve` runs before the handler, reads the cookie/bearer token off
  `headers`, and either 401s or merges `user`/`session` straight into the
  handler's context (not nested under an `auth` key — the macro is _named_
  `auth`, but what it injects is `user`/`session`).

## Protecting a route

1. `.use(authMiddleware)` on the Elysia instance.
2. Add `auth: true` to the route's options (third arg) to require a session.
3. Destructure `user`/`session` straight out of the handler's context.

```ts
import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { tErrorResponse } from "@src/utils";

export const featureRoutes = new Elysia({ prefix: "/feature" })
  .use(authMiddleware)
  .get("/", ({ user }) => FeatureService.getProfile(user), {
    auth: true, // <- checks session; makes `user`/`session` available above
    response: {
      200: t.Object({/* ... */}),
      401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() }))
    }
  });
```

Real example: `src/routes/firstdate/index.ts`.

Always declare `401` in `response:` when using `auth: true` — Elysia rejects
undeclared response shapes in dev, and the macro's `status(401, ...)` needs a
matching schema to actually serialize.

## Manual auth check (no macro)

Some routes need to distinguish 401 (not logged in) from 403 (logged in, wrong
resource) with custom messages per case — the macro only gives you a bare 401.
For that, skip `auth: true` and check a decorated/derived `auth` value
yourself:

```ts
.get("/user/:userId", ({ auth, status, params }) => {
  if (!auth.user)
    return status(401, errorResponse("UNAUTHORIZED", { message: "Login required" }));
  if (auth.user.userId !== params.userId)
    return status(403, errorResponse("FORBIDDEN", { message: "Not your account" }));
  // ...
})
```

This is the shape `src/routes/example.ts` uses — but note its `auth` there is
`.decorate("auth", Math.random() > 0.5 ? {...} : { user: null })`, a **fake**
stand-in for demo purposes only. For a real route, derive `auth` the same way
the macro does — call `auth.api.getSession({ headers })` yourself in a
`.derive()` — don't copy the `Math.random()` line.

Prefer the `auth: true` macro unless you actually need per-case 401 messages
or the 401/403 split; it's less code and it's what the macro exists for.

## Getting the project (firstdate vs rpkm)

Project context comes from which route file mounted the handler, not from
`user`/`session` — `src/routes/firstdate/*` is always project `firstdate`,
`src/routes/rpkm/*` is always project `rpkm` (see the prefix header comments
in each). There's no cross-project `req.project` derived from the Host header
in code yet; the two are kept apart purely by which route tree served the
request. If you need the request's origin host at runtime (e.g. to build a
`callbackURL`), read it off `request.headers.get("host")` directly.

## Testing locally

`GET /v1/auth/get-session` needs a real cookie/bearer token — get one by
completing the Google sign-in flow (see `docs/auth/overview.md` Flow 1, and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env`). There's no bypass for
`auth: true` in dev; if you're iterating on a protected route without wanting
to run the full OAuth flow each time, temporarily drop `auth: true` and
mock the value you need, then remove the mock before committing.
