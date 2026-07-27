# Round 2 house selection — frontend integration guide

A second house-pick round for freshmen whose group didn't get a house in
round 1. It reuses every round-1 endpoint under `/v1/rpkm/groups/*` and
`/v1/rpkm/houses/*` — **there is no separate round-2 route tree and no
"enter round 2" call**. Which round applies is resolved server-side from the
current time and the caller's group state; the frontend mostly just keeps
calling the same endpoints and reacts to the response.

## Timeline (Asia/Bangkok, UTC+07:00)

| Event                                                       | When               |
| ----------------------------------------------------------- | ------------------ |
| Round 2 opens (join/leave/kick/code-gen/preferences unlock) | 28 Jul 2026, 00:00 |
| Round 2 closes (everything locks again, automatically)      | 30 Jul 2026, 12:00 |
| Round 2 results announced                                   | 30 Jul 2026, 19:00 |

Locking/unlocking is time-based on the backend (`src/constants.ts` ->
`rpkm_house_pick_round2` / `rpkm_house_result_round2`) — no manual step
happens between close and announce. Don't build a countdown against a
"round 2 confirmed" flag; there isn't one.

## Who's eligible

A group is **round-2 eligible** iff it has no assigned house yet
(`assignedHouseId` is null on `GET /v1/rpkm/groups/me`). There's no separate
eligibility endpoint — check the group you already have.

- **Already has a house (round 1 winner):** every group-mutating call
  (`join`, `leave`, kick, regenerate code, set preferences) returns
  `ALREADY_CONFIRMED` (or `HOUSE_PICK_CLOSED` for preferences) at all times,
  round 1 or round 2. These groups are frozen forever — don't show round-2
  UI to them at all; keep showing their round-1 result.
- **Still houseless:** the group carries over from round 1 as-is (same
  members, same join code) and simply unlocks for the round-2 window. If the
  group had a stale round-1 `confirmedAt` lock, it's ignored while round 2 is
  open and reapplies automatically once round 2 closes.

## Which houses are pickable

`GET /v1/rpkm/houses/` returns every house tagged with
`availableInRound2: boolean`. Houses **not** in the round-2 list also come
back with `capacity: null` (round-2 houses hide capacity so the frontend
doesn't need to special-case it — just render it if present):

```jsonc
// GET /v1/rpkm/houses/  (raw array, no {success,data} envelope)
[
  { "id": "...", "code": "house03", "capacity": null, "info": {...}, "availableInRound2": true },
  { "id": "...", "code": "house07", "capacity": 59, "info": {...}, "availableInRound2": false }
]
```

Render the full list always; gray out (`availableInRound2: false`) rather
than filtering, so students understand why most houses are unselectable
during round 2. The round-2 whitelist itself is hardcoded server-side
(`ROUND2_HOUSE_CODES` in `src/constants.ts`) — don't hardcode it again on
the frontend, always read `availableInRound2` off the response.

`PUT /v1/rpkm/groups/me/house-preferences` enforces this server-side too:
submitting a houseId that isn't round-2-available while round 2 is open
returns `BAD_REQUEST`. The 1-5 item / uniqueness rules from round 1 still
apply unchanged.

## Endpoints (all under `/v1/rpkm`, all `auth: true`)

Same set as round 1 — nothing new to wire up, just call them during the
round-2 window instead of round 1's:

| Method & path                          | Purpose                                  | Notes for round 2                                                                                      |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /groups/me`                       | Current group + members                  | Check `assignedHouseId` here for eligibility                                                           |
| `POST /groups/join`                    | Join by code                             | `body: { joinCode }`                                                                                   |
| `POST /groups/me/join-code/regenerate` | New join code (leader only)              |                                                                                                        |
| `GET /groups/me/house-preferences`     | Current ranked picks                     | Automatically returns round-2 picks once the group has any, or once round 2 is open                    |
| `PUT /groups/me/house-preferences`     | Replace ranked picks (leader only)       | `body: { houseIds: string[] }` (1-5, unique). Round-2 houseIds only, once round 2 is the active window |
| `DELETE /groups/me`                    | Leave (self lands in a fresh solo group) |                                                                                                        |
| `DELETE /groups/me/members/:userId`    | Kick (leader only)                       |                                                                                                        |
| `GET /houses/`                         | List houses                              | Now includes `availableInRound2`                                                                       |
| `GET /houses/stats?round=2`            | Demand stats                             | See below — `round` defaults to `1` if omitted                                                         |
| `GET /houses/result`                   | My group's assigned house                | Gates on round-1 or round-2 announce window automatically                                              |

Response envelope is inconsistent across these — `/houses/`, `/houses/stats`,
and `/houses/:id` return the raw array/object; `/groups/*` and
`/houses/result` wrap in `{ success: true, data }`. This matches round 1;
nothing changed here for round 2.

## Stats: `GET /houses/stats?round=2`

```jsonc
// GET /v1/rpkm/houses/stats?round=2
[
  { "houseId": "...", "code": "house03", "count": 12 },
  { "houseId": "...", "code": "house21", "count": 4 }
]
```

- `round` is an optional query param, `1` or `2`, **default `1`** — pass
  `?round=2` explicitly during round 2, otherwise you'll silently get round
  1's (frozen, no-longer-changing) numbers.
- `count` is **students**, not groups — a group's whole roster counts
  toward its rank-1 pick, matching round 1's stats semantics.
- Only rank-1 (top choice) picks count, and only for the requested round —
  a group's leftover round-1 picks never leak into round-2 numbers even if
  they happened to pick a house that's also in the round-2 list.

## Result: `GET /houses/result`

Same endpoint as round 1. Behavior:

- Returns `RESULT_NOT_ANNOUNCED` (403) before the relevant announce time.
- Which announce time applies is picked automatically per group: if the
  group ever submitted round-2 preferences, it's gated on the round-2
  announce window (30 Jul 19:00); otherwise it's gated on round 1's
  (23 Jul 19:00, already open). Round-1 winners keep seeing their result
  the whole time — round 2 never touches or hides it.
- `data` is `null` if the group never got a house (didn't pick, or the draw
  skipped it) — same meaning as round 1.

## Error codes to handle

No new error codes were introduced for round 2 — reuse the existing
handling:

| Code                   | HTTP | When (round-2 specific cases)                                                                                         |
| ---------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `ALREADY_CONFIRMED`    | 409  | Group already has a house, or round 2's window isn't currently open for a houseless group (before open / after close) |
| `HOUSE_PICK_CLOSED`    | 409  | Same as above, but for `PUT house-preferences` specifically                                                           |
| `BAD_REQUEST`          | 400  | A submitted houseId doesn't exist, or (round 2 only) isn't in the round-2 list                                        |
| `RESULT_NOT_ANNOUNCED` | 403  | Before the applicable announce time (round 1's or round 2's, per above)                                               |

## Manual testing locally

There's no draw endpoint in this backend for either round — the actual
random assignment is an external manual script that writes
`groups.assigned_house_id`/`assigned_at` directly. To exercise the full
round-2 flow locally: seed a couple of dev students via `/v1/dev/admin/users`
(see `docs/dev-endpoints.md`), leave their group's `assignedHouseId` null,
and temporarily point `rpkm_house_pick_round2.start` in `src/constants.ts`
at "now" on a local branch so the window is open — don't commit that change.
