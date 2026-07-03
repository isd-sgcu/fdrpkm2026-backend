# Shared DB Design — CU First Date 2026 + รับเพื่อนก้าวใหม่ 2569

**Date:** 2026-06-30
**Engine:** Postgres + Drizzle ORM (shared package between both backends)
**Goal:** Two websites, one DB, near-identical data, least friction. Register once, reuse across projects.

## Core decisions

| Decision           | Choice                                                                   | Why                                                                                    |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Project separation | Shared tables, `project` tag where they differ                           | Data near-identical; one migration set                                                 |
| Identity           | One shared `students` (person) record per SSO identity                   | Register once; prefill the other project                                               |
| Per-project data   | `registrations` row per (student, project)                               | Carbon/travel/PDPA asked per project                                                   |
| Bilingual          | i18n files keyed by `code`; **no** lang columns in DB                    | Content set fixed (22 houses, games). Tradeoff: copy edit = deploy                     |
| Carbon             | Store ordered travel **legs** (method only), **no** computation          | Trip = multiple legs; team hands off raw, computes downstream                          |
| Activity gating    | Hardcoded app **config**, not a DB table                                 | Dates/flags are fixed; ~6 features. Change = redeploy, acceptable                      |
| QR                 | Static QR per point + server-side validation                             | Window + dedupe + **GPS gate (config toggle)**                                         |
| QR security        | No rotating/TOTP QR                                                      | GPS gate from `GAMES[game].requireGps` config; GPS via browser `navigator.geolocation` |
| House groups       | Group-level; everyone always in exactly one group; join via 6-digit code | No explicit create; auto solo group at registration                                    |

### Prefill UX

On RPKM entry: SSO → look up `students` by `student_id`. Row exists → prefill shared fields. Else show form with project-only fields (travel legs, RPKM PDPA, attended_days).

## Tables

> **Conventions (apply to every table):**
>
> - Primary key `id` is `uuid` with `default gen_random_uuid()`. All FKs are `uuid`.
> - Every table has `created_at` + `updated_at` (`timestamptz`, default `now()`; `updated_at` auto-touched on update).
> - `student_id` (CUNET, varchar) is the QR payload and the SSO conflict target — **not** the uuid pk.
> - Per-table blocks below omit `id`/`created_at`/`updated_at` for brevity; they're always present.

### Identity (shared, asked once)

```
students
  id            pk
  student_id    text unique          -- CUNET id, also the QR payload
  email         text unique          -- from Chula SSO
  prefix        'mr'|'mrs'|'ms'|'not_specified'|'other'  -- คำนำหน้าชื่อ; NOT NULL default 'not_specified'
  first_name, last_name, nickname    -- single language; names aren't translated
  faculty, department, year
  -- year-one is derived: student_id starts with '69' (cohort 2569). No stored column.
  phone, line_id
  emergency_contact_name, emergency_contact_phone
  allergies, dietary, medical_notes
  role          'student' | 'staff'  -- staff register same as students
  pno_sgcu_awareness  text (nullable)  -- survey (P&O): familiarity with SGCU; answer code, frontend-owned
  created_at, updated_at
```

QR code = `student_id`. No QR table.

### Per-project enrollment

```
registrations
  id               pk
  student_id       fk → students
  project          'firstdate' | 'rpkm'
  pdpa_accepted_at timestamptz
  attended_days    int (nullable; RPKM carbon form — how many days attended)
  group_id         fk → groups (nullable; RPKM rows only — the student's one group)
  pno_referral_source  text (nullable)  -- survey (P&O): publicity channel seen; answer code, frontend-owned
  created_at
  unique(student_id, project)
```

### Travel legs (carbon — up to 2 legs per registration)

```
travel_legs
  id                pk
  registration_id   fk → registrations
  seq               int      -- 1 or 2; CHECK (seq in (1,2))
  vehicle              text  -- enum (8 below); 'other' → vehicle_other
  vehicle_other        text null
  origin_district      text  -- free text (not validated; frontend sends it)
  origin_province      text  -- free text
  destination_district text  -- free text
  destination_province text  -- free text
  unique(registration_id, seq)             -- no two leg-1s for one registration
```

`vehicle` = a code (label in i18n) + a nullable `vehicle_other` for "อื่นๆ โปรดระบุ". Origin/destination are each split into free-text `*_district` + `*_province` (no `*_other`). No distance/km — store choices only; carbon computed downstream.

**vehicle** (TH/EN labels in i18n): `private_car`, `private_ev`, `transit` (BTS/MRT/ARL), `bus`, `taxi`, `motorcycle`, `bike_walk`, `other`.
**origin/destination**: each split into `*_district` + `*_province`, stored as **free text — not validated in the backend** (the frontend owns the values). No `*_other`.

> "ท่านเดินทางมาจากเขตใด" (top of form) = leg 1's `origin_district`; not stored separately.
> RPKM and FD carbon forms differ (FD = 1-day, simpler). Same `travel_legs` shape serves both; `attended_days` is RPKM-only.

### Activity gating = app config (NOT a table)

Dates/flags are fixed → hardcoded config constant per frontend. Change = redeploy (acceptable; they don't change).

```ts
const GAMES = {
  jigsaw: { open: "2026-07-20", close: "2026-08-03", yearOneOnly: true, requireGps: true },
  csr: { open: "2026-07-20", close: "2026-08-07", yearOneOnly: true, requireGps: true }
};
const HOUSE_REG = { open: "2026-07-18T00:00+07", close: "2026-07-22" };
const STATIC = {
  field_trip: { open: "…", close: "…", formUrl: "…" },
  my_freshy_story: { open: "…", close: "…", formUrl: "…" }
};
const FD_EVENT_VISIBLE = true; // flip false + redeploy after the 18th
```

Server reads this to gate scans (window / year-one / gps); frontend reads it to enable/disable buttons. Static pages = frontend pages + config date gate. No DB rows for any of it.

### Event entries (staff entry scans — all events)

```
entries
  id          pk
  student_id  fk → students              -- the น้อง who entered
  scanned_by  fk → students              -- staff who scanned (or manual-entry staff)
  event       'firstdate' | 'freshmennight' | 'rpkm'   -- each event scanned separately
  scanned_at  timestamptz default now()
  unique(student_id, event)               -- one entry per student per event
```

Staff scans participant QR (or types student_id on scan failure) → insert. Dedupe via unique. (FD home button hide-after-event = `FD_EVENT_VISIBLE` config flag, redeploy.)

### QR checkpoints + scan log (jigsaw, CSR — multi-point games)

```
checkpoints
  id          pk
  game        text                       -- 'jigsaw' (10 rows) | 'csr' (~35 rows)
  code        text unique                -- QR payload
  lat, lng    numeric null               -- where the point is; gate compares against this
  geofence_radius_m int default 50       -- allowed distance for a valid scan

scans
  id           pk
  checkpoint_id fk → checkpoints
  student_id   fk → students             -- self-scan; gets credit
  scanned_at   timestamptz default now() -- the timestamp logging requirement
  lat, lng     numeric null              -- captured from browser at scan time
  unique(checkpoint_id, student_id)       -- one credit per point
```

**Scan validation (server-side):** game window open + dedupe (always; window from `GAMES[checkpoint.game]` config). If `GAMES[game].requireGps`: browser sends lat/lng (`navigator.geolocation`); reject if missing or farther than `checkpoints.geofence_radius_m` from the checkpoint. Flip `requireGps` in config + redeploy to disable. lat/lng always stored.
**Stats** ("name, student_id, count collected") = `count distinct checkpoint per student` grouped by `checkpoints.game`. No stats table.

### RPKM houses

```
houses
  id       pk
  code     text unique     -- 22 rows; name/description in i18n
  capacity int null
  info     jsonb null      -- misc structured data if needed

groups
  id                pk
  leader_id         fk → students
  join_code         text unique    -- 6-digit; leader regenerates anytime
  assigned_house_id fk → houses (nullable; set by the random)
  assigned_at       timestamptz null
  created_at                       -- auto-created at RPKM registration (solo) / on leave-kick-disband

-- membership: NO join table. registrations.group_id holds it (1:1 by invariant).
-- members of a group = registrations WHERE group_id = X AND project='rpkm'.

group_house_choices
  id        pk
  group_id  fk → groups
  house_id  fk → houses
  rank      int      -- CHECK (rank between 1 and 5)
  unique(group_id, rank), unique(group_id, house_id)   -- leader writes, for whole group
```

## House group rules (app-enforced)

**Invariant:** every RPKM student is always in exactly one group. Held by `registrations.group_id` (one RPKM registration per student → exactly one group). No join table.

- **Auto solo group** created at RPKM registration: new `groups` row (`leader_id` = self), set `registrations.group_id`. No explicit "create group" UI.
- **Join** (`join_code`) → point `registrations.group_id` at target group T:
  - Guard: T member count < 4. Leader of a multi-member group **cannot** join (would orphan members) — must kick/disband first.
  - Solo joiner → delete own (now-empty) group, set group_id = T.
  - Non-leader member → just set group_id = T (old group keeps its other members).
- **Leader regenerates `join_code`** anytime → old code dead (stops leaks).
- **Leave / kick / disband → lander gets a fresh solo group** (self = leader):
  - Member leaves → new solo group, point own group_id at it.
  - Leader kicks member → kicked member → new solo group.
  - Leader leaves → group dissolves: **every** member incl. the ex-leader → own solo group; delete the old group.
- Member count = `count(registrations WHERE group_id = X)`.
- **All group ops run in one transaction** and `SELECT … FOR UPDATE` the target group row, so two simultaneous joins can't push a group past 4.
- House ranking 1–5 → only leader writes `group_house_choices`, applies to whole group via `group_id`.
- Random assignment → set `groups.assigned_house_id` + `assigned_at`. Announcement reads this.

## Integrity, types & indexes (best practice)

**Identity key.** Upsert `students` on `student_id` (immutable from CUNET). `email` also `unique` but is the weaker key — don't conflict-target it.

**Enums** (Drizzle `pgEnum`, or `text` + `CHECK`): `registrations.project`, `students.role`, `students.prefix`, `checkpoints.game`, `travel_legs.vehicle`. Catches typos at write time; cheap to extend. `travel_legs.origin_district`/`origin_province`/`destination_district`/`destination_province` are deliberately **plain `text`** — validated by the frontend, not the DB.

**CHECK constraints:** `travel_legs.seq IN (1,2)`, `group_house_choices.rank BETWEEN 1 AND 5`.

**FK `ON DELETE`:**

| FK                                                 | rule     | why                                                              |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `travel_legs.registration_id`                      | CASCADE  | legs are owned by the registration                               |
| `group_house_choices.group_id`                     | CASCADE  | disband clears the group's picks                                 |
| `registrations.group_id`                           | SET NULL | safety; app already moves members off a group before deleting it |
| everything → `students` / `houses` / `checkpoints` | RESTRICT | never delete people/houses/points mid-event                      |

**Indexes** (beyond PK + the uniques already declared):

- `registrations(group_id)` — membership lookups (hot).
- `scans(student_id)` — per-student progress.
- `group_house_choices(house_id)` — the demand `GROUP BY`.
- `travel_legs(registration_id)` — fetch a registration's legs.

**Transaction ordering** (RPKM register + auto group, FK cycle-safe):

1. upsert `students`
2. insert `registrations` (`group_id` null)
3. insert `groups` (`leader_id` = student)
4. update `registrations.group_id` = new group
   All in one transaction. Group join/leave/kick/disband also each run in a single transaction with `SELECT … FOR UPDATE` on the affected group.

**Timestamps:** `timestamptz` everywhere; `created_at`/`updated_at` default `now()`.

## User flows

1. **Landing** → two separate websites, each its own landing page (no central project picker). Enter either → Chula SSO login.
2. **First register on a site** → upsert `students` from SSO (conflict target `student_id`); if no `registrations(student, this_site)`, show this site's registration page (shared fields prefilled **if** the other site was already done, else blank from SSO; ask travel legs + PDPA) → insert `registrations`. On RPKM registration also auto-create solo group (one transaction, see below).
3. **Cross-over** (registered FD, now on RPKM site) → `students` known by `student_id` → RPKM registration page prefilled, only RPKM-specific fields empty → insert RPKM `registrations`.
4. **Event day-of** → participant shows QR (`student_id`); staff scans → `entries` (event = firstdate | freshmennight | rpkm); manual student_id entry as backup.
5. **RPKM houses** → list visible always (i18n), register opens 18/7 → solo group exists; join via code / kick / leave / disband per rules (all via `registrations.group_id`); leader sets rank 1–5 → `group_house_choices`; 22/7 close; 23–25/7 batch random → `groups.assigned_house_id`; 26/7 members read assignment.
6. **RPKM games** → year-one gate (`69%`) + window (config) → scan static QR → `scans` (dedupe + timestamp); progress = my scans / total; stats export grouped by `checkpoints.game`.
7. **RPKM static** (field_trip, my_freshy_story) → in window (config) → button → `formUrl`; else disabled.
8. **Admin** → hide FD after 18th (`FD_EVENT_VISIBLE=false`, redeploy); games auto-disable via config `close`; exports via SQL.

## Windows (from requirements → app config, not DB)

| feature                     | window            | flags                                 |
| --------------------------- | ----------------- | ------------------------------------- |
| event entry scans (entries) | per event         | FD_EVENT_VISIBLE toggles home button  |
| house reg                   | 18/7 00:00 – 22/7 | —                                     |
| jigsaw                      | 20/7 – 3/8        | year-one, 10 checkpoints, requireGps  |
| csr                         | 20/7 – 7/8        | year-one, ~35 checkpoints, requireGps |
| field_trip                  | per calendar      | year-one, gg form                     |
| my_freshy_story             | per calendar      | year-one, gg form                     |

## Out of scope / skipped (YAGNI)

- **Prize tables** — threshold query on `scans`. Add when prize logic is defined.
- **Freshmen Night** — entry scan via `entries` (event `freshmennight`, part of RPKM); activities themselves use CUDSON, not our system.
- **Personality test** — not this year.
- **Fest registration / capacity / full-check** — not our system anymore. Dropped `activity_signups` + `activities.capacity`.
- **Carbon computation** — store choice only.
- **Bilingual content columns / translation table** — i18n files.
- **Rotating QR** — add only if cheating is observed.
- **Leadership transfer** — leader leaving disbands instead.
- **group_members join table** — invariant makes membership 1:1 → `registrations.group_id` instead.
- **house_assignments table** — 1:1 result → `groups.assigned_house_id` instead.
- **activities table** — dates/flags are fixed → hardcoded app config. `checkpoints.game` replaces the FK.

## Resolved

- Year-one check = `student_id LIKE '69%'`. Derived everywhere, no column.
- Freshmen Night = CUDSON, not in scope.
- GPS gate = on by default, `GAMES[game].requireGps` config toggles it. lat/lng always stored.
