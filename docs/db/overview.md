# CU First Date 2026 × รับเพื่อนก้าวใหม่ 2569 — Database Overview (for the team)

A plain-language explanation of how we're storing data for both websites. No database background needed to read this.

---

## The big picture

We're building **two separate websites** (FirstDate and รับเพื่อนก้าวใหม่) that **share one database** behind the scenes.

Why share? Because the same น้อง uses both, logs in the same way (Chula SSO), and gives us mostly the same info. We don't want them filling the same form twice. So:

- **A person is stored once.** Whether they came through the FirstDate site or the RPKM site, they're the same record.
- **Each project's signup is stored separately.** FirstDate registration and RPKM registration are two different things, but both point back to the same person.

The practical result: if a น้อง already registered on FirstDate and then opens the RPKM site, we recognize them and **pre-fill** everything we already know. They only fill in what's new (RPKM travel info + RPKM consent).

The two websites stay completely independent in look and code. The **only** thing they share is this database.

---

## What we store (each "table" = a list of things)

Think of each table as a spreadsheet/list. Here are all 12:

### People & signups

- **students** — one row per person. Name, faculty, contact, allergies, etc. Their student ID doubles as their QR code. We can tell who's a first-year because their student ID starts with `69`.
- **registrations** — one row per (person + project). Holds their PDPA consent and, for RPKM, how many days they attended. A person can have up to two: one for FirstDate, one for RPKM.
- **travel_legs** — the carbon-footprint travel answers. A trip can have up to 2 legs (e.g. walk → BTS), so each leg is its own row: vehicle type, origin district, destination. We only store the answers — we do **not** calculate carbon ourselves (whoever owns that data does the math later).

### Event entry scans

- **entries** — when a staff scans a น้อง's QR at an event entrance, we record it here. Each event is scanned separately (`event` = `firstdate` | `freshmennight` | `rpkm`), so up to three rows per น้อง — one per event. If scanning fails, staff can type the student ID instead — same result.

### Walk rally (31 July, 12:00–16:00)

- **walk_rally_activities** — the 8 activities: 3 workshops (ลูกชุบ, พิมเสนน้ำ, เพ้นท์ถุงผ้า), 4 museums, 1 board-game minigame. Names/descriptions live in the i18n files, keyed by code.
- **walk_rally_registrations** — a น้อง's pre-booked slots (activity + round 1–6). Rules baked in: can't book the same activity twice, can't book two things in the same round, each slot caps at 30 (first come, first serve). Can change/cancel until reg closes 29 July 23:59.
- **walk_rally_attendances** — after each slot, staff scan the น้อง's QR to record they actually attended → 1 point per activity. Walk-ins (no pre-booking) get scanned and counted the same way. Scanning the same activity twice does nothing (no error). Collect 4+ points → reward.

### RPKM stamp games (Jigsaw + CSR)

- **checkpoints** — the QR-code points. 10 points around campus (Jigsaw) + ~35 shops (CSR). Each has its location.
- **scans** — every time a น้อง scans a checkpoint, we log who, which point, and exactly when. A น้อง can only get credit once per point. Game stats (who collected how many) come straight from this.

### RPKM houses (บ้าน)

- **houses** — the 22 houses.
- **groups** — a group of friends (up to 4). Has a leader and a 6-digit join code. After the random draw, the assigned house gets written here too.
- **group_house_choices** — each group's ranked house picks (1st choice … up to 5th). One row per pick.

---

## How the key features work

**Logging in & registering.** น้อง opens either site → logs in with Chula SSO → if they haven't registered on _that_ site yet, they see the registration form (pre-filled if they did the other site already). Done once per site.

**The QR / scanning.** Every น้อง's QR is just their student ID.

- _FirstDate:_ staff scan น้อง to mark attendance.
- _Games:_ น้อง scan the static QR posted at each point. The server checks: is the game open right now? are they a first-year? are they actually near the point (GPS)? Already scanned this point? If all good → recorded.
- _Walk rally:_ น้อง show their booked-slot screen to enter; after each slot ends, staff scan their QR → 1 point per activity (walk-ins too).

**GPS check.** Each game point has a real location. When a น้อง scans, their phone sends its location and we check they're close enough. This is **on by default** but can be switched off instantly (in a config setting) if it causes trouble on game day — for example if GPS is flaky indoors.

**Houses & the group system.** This is the most interesting part:

- Everyone is **always in exactly one group.** When you register for RPKM, you automatically get your own group (just you, you're the leader).
- To team up: the leader shares their **join code**, friends enter it to join. Max 4 per group.
- The leader can kick members and re-generate the code (kills the old one if it leaked). Any member can leave — when they do, they get their own fresh solo group again.
- If the leader leaves, the group breaks up and everyone goes back to their own solo group.
- The **leader** picks the group's ranked house choices (1–5) for everyone.
- On 23–25 July we run the **random draw**: each group gets assigned a house based on their ranked choices. Announced 26 July.
- We can easily show **how many groups wanted each house** — useful for checking the draw.

**Static activities (Field Trip, My Freshy Story).** These are just info pages with a Google Form button. They turn on/off based on their dates. No special storage needed.

---

## Decisions worth knowing

- **Languages (TH/EN):** the website text lives in translation files, not the database. The database stores short codes; the site shows Thai or English depending on the toggle.
- **Dates & on/off switches** (when games open/close, hiding the FirstDate button after the event) live in a **config file in the code**, not the database — because they're fixed and won't change. Changing one means a small redeploy, which is fine.
- **We don't calculate carbon.** We collect the travel answers and hand them off raw.

---

## Not in scope (so nobody expects it)

- **Freshmen Night** — handled by CUDSON, not us.
- **Personality test** — not happening this year.
- **Day-18 stamp collection** — paper-based, not our system.
- **Fest registration** — not our system anymore.
- **Prizes/sponsor logic** — we provide the game stats; reward rules are decided outside the system.

---

## Timeline the data supports

| Date                | What happens                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| 12 Jul              | House info finalized (we seed the 22 houses)                                    |
| 17 Jul (before 7pm) | FirstDate site live: login, registration, QR                                    |
| 18 Jul              | FirstDate event — staff scanning; RPKM house registration + groups open (00:00) |
| 20 Jul              | Stamp games (Jigsaw + CSR) open                                                 |
| 22 Jul              | House group selection closes                                                    |
| 23–25 Jul           | Random house draw                                                               |
| 26 Jul              | Houses announced (before 7pm)                                                   |
| 3 Aug / 7 Aug       | Jigsaw / CSR games close                                                        |
| 5–6 Aug             | Game stats exported                                                             |
