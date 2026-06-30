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
- A Postgres database (Supabase / Neon / local)

## Setup
```sh
bun install
bun run hooks:install
cp .env.example .env
bun run dev
```

## Layout
```
src/
  app.ts            Elysia app
  index.ts          server entry
  config/env.ts     env
  routes/
    index.ts        mounts everything under /api/v1
    health.ts       GET /api/v1/health
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
GET /api/v1/health  ->  { "status": "ok", "service": "fdrpkm2026-backend" }
```
