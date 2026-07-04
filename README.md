# fdrpkm2026-backend

One backend for **CU First Date 2026** and **รับเพื่อนก้าวใหม่ 2569**. Elysia + Bun + TypeScript, with a shared Drizzle/Postgres database. Merged from the former `firstdate2026-backend` and `rpkm2026-backend`.

## Two frontends, one backend, two API hosts

```
FD frontend   -> fd-api.rpkm2026.com   --\
                                          >-- fdrpkm2026-backend -- shared Postgres
RPKM frontend -> rpkm-api.rpkm2026.com --/
```

Project context comes from the **Host header** (`fd-api.*` = firstdate, `rpkm-api.*` = rpkm) — see `src/routes/auth`. Chula SSO carries no custom data; the return URL is built from whichever host was hit.

## Prerequisites

- Bun
- A Postgres database (Supabase / Neon / local) — optional for local dev, see below
- A Google OAuth client (for Chula SSO login) — optional unless you're touching `src/routes/auth`

## Development setup

1. **Install deps + git hooks**
   ```sh
   bun install
   bun run hooks:install
   ```
2. **Env file**
   ```sh
   cp .env.example .env
   ```
   Defaults work out of the box for most day-to-day work:
   | Var                                         | Default                 | Notes                                                                                                    |
   | ------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
   | `PORT` / `HOST`                             | `3000` / `0.0.0.0`      |                                                                                                          |
   | `NODE_ENV`                                  | `development`           | mounts `exampleRoutes` (see `src/routes/example.ts`)                                                     |
   | `DATABASE_FILE`                             | `./local.db`            | used instead of `DATABASE_URL` when `NODE_ENV=development` — no real Postgres needed to start hacking    |
   | `DATABASE_URL`                              | unset                   | set this (Supabase/Neon/local Postgres) to run against real Postgres, e.g. before `db:push`/`db:migrate` |
   | `BETTER_AUTH_SECRET`                        | placeholder             | generate a real secret before testing auth flows: `openssl rand -base64 32`                              |
   | `BETTER_AUTH_URL`                           | `http://localhost:3000` |                                                                                                          |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | unset                   | only needed to exercise the Chula SSO login flow locally, see `src/routes/auth`                          |
3. **Run the server**
   ```sh
   bun run dev
   ```
   Hot-reloads on save. Check `GET /v1/health` and `http://localhost:3000/openapi` come up.
4. **Database (only if you're touching schema/storage)** — see `docs/db/` for the design, then:
   ```sh
   bun run db:generate   # drizzle-kit generate, from src/db/schema.ts
   bun run db:push       # or db:migrate, depending on workflow
   bun run db:studio     # inspect data
   ```
5. **Before committing**
   ```sh
   bun run typecheck
   bun run lint
   bun test
   ```
   (`hooks:install`'s pre-commit only auto-runs Prettier + ESLint on staged files — typecheck/test are on you before pushing.)

Adding a new feature route/service? See [`docs/new-route.md`](docs/new-route.md) for the step-by-step and [`docs/mvc.md`](docs/mvc.md) for the layering rules.

## Layout

```
src/
  app.ts            Elysia app
  index.ts          server entry
  config/env.ts     env
  routes/
    index.ts        mounts everything under /v1
    health.ts       GET /v1/health
    auth/           Chula SSO login + callback (project from Host header)
    firstdate/      project=firstdate routes
    rpkm/           project=rpkm routes
docs/db/            DATABASE DESIGN — implement this with Drizzle (see below)
```

## Database — TODO (backend team owns this)

The schema is **designed but not yet implemented** — that's your job. Everything you need is in `docs/db/`:

- `schema-spec.md` — the 10 tables, constraints, indexes, FK rules, transaction rules
- `schema.dbml` — paste into [dbdiagram.io](https://dbdiagram.io) for the ER diagram + a free PostgreSQL `CREATE TABLE` export
- `diagrams.md` — flow + group state machine
- `overview.md` — plain-language summary

Suggested path: set up Drizzle (`drizzle-orm` + `drizzle-kit` + `postgres`), write `src/db/schema.ts` from the spec, add `DATABASE_URL` to env, generate + run migrations, seed houses/checkpoints.

Key contract (don't skip): shared tables `students`/`registrations`/`travel_legs` are written by both projects — upsert students by `student_id`, one `registrations` row per `(student, project)`. Group ops run in a transaction with `SELECT … FOR UPDATE` on the group row.

## Scripts

```sh
bun run dev | build | start | typecheck | lint | format | test
```

## Health

```txt
GET /v1/health  ->  { "status": "ok", "service": "fdrpkm2026-backend" }
```
