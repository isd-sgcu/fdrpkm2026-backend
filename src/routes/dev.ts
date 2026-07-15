import { makeSignature } from "better-auth/crypto";
import { eq, inArray, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { env } from "@src/config";
import { db, type Database } from "@src/db";
import {
  checkpoints,
  entries,
  groups,
  houses,
  registrations,
  scans,
  students,
  user as authUsers,
  walkRallyActivities,
  walkRallyAttendances,
  walkRallyRegistrations
} from "@src/db/schema";
import {
  AppError,
  auth,
  generateJoinCode,
  successResponse,
  tAppErrors,
  tSuccessResponse
} from "@src/utils";

/**
 * Dev-only tooling for the frontend teams: create test personas, impersonate
 * them (mint a real better-auth session without Google SSO), list/delete
 * them, and seed baseline fixture data on an empty database.
 *
 * Only mounted when NODE_ENV=development (see src/routes/index.ts) — but
 * staging also runs in development mode on a public URL, so every route
 * except the `GET /dev` ping additionally requires the `x-dev-key` header to
 * match env.DEV_API_KEY. No key configured = every call rejected.
 */

const CHULA_EMAIL_DOMAIN = "@student.chula.ac.th";
const emailFor = (studentId: string) => `${studentId.toLowerCase()}${CHULA_EMAIL_DOMAIN}`;

// -- body/response schemas ---------------------------------------------------

const tProject = t.Union([t.Literal("firstdate"), t.Literal("rpkm")]);
const tStaffRole = t.Union([
  t.Literal("firstdate"),
  t.Literal("rpkm"),
  t.Literal("walkrally"),
  t.Literal("freshmennight")
]);
type StaffRole = "firstdate" | "rpkm" | "walkrally" | "freshmennight";

// Which project's registration row carries each staff role — same mapping the
// check-in gate uses (see services/checkin.helper.ts STAFF_GATE).
const STAFF_ROLE_PROJECT: Record<StaffRole, "firstdate" | "rpkm"> = {
  firstdate: "firstdate",
  rpkm: "rpkm",
  walkrally: "rpkm",
  freshmennight: "rpkm"
};

const tStudentIdParam = t.String({
  pattern: "^[0-9]{10}$",
  description: "CUNET id — becomes <studentId>@student.chula.ac.th",
  examples: ["6912345678"]
});

const tDevUser = t.Object({
  studentId: t.String(),
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  nickname: t.Nullable(t.String()),
  role: t.String(),
  registrations: t.Array(
    t.Object({
      project: t.String(),
      staffRole: t.Nullable(t.String()),
      groupId: t.Nullable(t.String())
    })
  )
});

// -- better-auth session minting ---------------------------------------------

/**
 * Finds or creates the better-auth `user` row for a Chula email. Uses the
 * internal adapter, which bypasses the sign-in request hooks (Google-only,
 * domain check) — exactly what a dev backdoor needs.
 */
const ensureAuthUser = async (email: string, name: string) => {
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) return { authUser: existing.user, created: false };

  const authUser = await ctx.internalAdapter.createUser({
    email,
    name,
    emailVerified: true
  });
  return { authUser, created: true };
};

/**
 * Mints a real better-auth session for a user and signs the token the same
 * way better-auth's own cookie layer does (`token.signature`). The unmodified
 * `auth.api.getSession()` path accepts it — via the session cookie *or* an
 * `Authorization: Bearer <token>` header (bearer plugin), no special-casing.
 */
const mintSession = async (userId: string) => {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  const signedToken = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;
  return { session, signedToken, sessionCookie: ctx.authCookies.sessionToken };
};

// -- default seed fixtures ---------------------------------------------------

// Placeholder codes — pass real codes in the body if the frontend i18n uses
// different ones. 22 houses per houses.schema.ts.
const DEFAULT_HOUSE_CODES = Array.from(
  { length: 22 },
  (_, i) => `house_${String(i + 1).padStart(2, "0")}`
);

// 8 activities per walk-rally.schema.ts: 3 workshops, 4 museums, 1 minigame.
// "cu_museum" is real (special-cased round schedule in walk-rally.service.ts);
// the rest are placeholders.
const DEFAULT_ACTIVITIES: { code: string; kind: "workshop" | "museum" | "minigame" }[] = [
  { code: "workshop_1", kind: "workshop" },
  { code: "workshop_2", kind: "workshop" },
  { code: "workshop_3", kind: "workshop" },
  { code: "cu_museum", kind: "museum" },
  { code: "museum_1", kind: "museum" },
  { code: "museum_2", kind: "museum" },
  { code: "museum_3", kind: "museum" },
  { code: "minigame_1", kind: "minigame" }
];

const DEFAULT_CHECKPOINTS: { game: "jigsaw" | "csr"; code: string }[] = [
  { game: "jigsaw", code: "jigsaw_1" },
  { game: "jigsaw", code: "jigsaw_2" },
  { game: "jigsaw", code: "jigsaw_3" },
  { game: "csr", code: "csr_1" },
  { game: "csr", code: "csr_2" },
  { game: "csr", code: "csr_3" }
];

// -- routes -------------------------------------------------------------------

export const createDevRoutes = (database: Database = db) =>
  // eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
  new Elysia({ prefix: "/dev" })
    // Unauthenticated ping so the frontend dev banner can detect dev mode
    // (route 404s entirely outside development).
    .get("", () => successResponse({ devMode: true as const }), {
      detail: {
        tags: ["Dev"],
        description: "Dev-mode probe for the frontend dev banner. No x-dev-key needed."
      },
      response: { 200: tSuccessResponse(t.Object({ devMode: t.Literal(true) })) }
    })
    // Everything below requires the shared dev key. Fails closed when
    // DEV_API_KEY is unset (e.g. someone flips staging to development mode
    // without configuring a key).
    .onBeforeHandle(({ headers }) => {
      if (!env.DEV_API_KEY || headers["x-dev-key"] !== env.DEV_API_KEY) {
        throw new AppError("UNAUTHORIZED", { message: "x-dev-key header required" });
      }
    })
    .guard({
      headers: t.Object({ "x-dev-key": t.String() }),
      response: tAppErrors("UNAUTHORIZED")
    })
    .post(
      "/admin/users",
      async ({ body, status }) => {
        const studentId = body.studentId.toLowerCase();
        const email = emailFor(studentId);
        const firstName = body.firstName ?? "Dev";
        const lastName = body.lastName ?? studentId;

        // `staffRoles` expands into registrations: each role lands on the
        // project whose check-in gate reads it (one registration per project,
        // so at most one role per project — the DB column is a single enum).
        const regs: {
          project: "firstdate" | "rpkm";
          staffRole?: StaffRole;
          withGroup?: boolean;
        }[] = (body.registrations ?? []).map((reg) => ({ ...reg }));
        for (const role of body.staffRoles ?? []) {
          const project = STAFF_ROLE_PROJECT[role];
          const existing = regs.find((reg) => reg.project === project);
          if (!existing) {
            regs.push({ project, staffRole: role });
          } else if (existing.staffRole && existing.staffRole !== role) {
            throw new AppError("BAD_REQUEST", {
              message: `staff roles "${existing.staffRole}" and "${role}" both live on the ${project} registration — one role per project`
            });
          } else {
            existing.staffRole = role;
          }
        }
        // A persona holding staff roles must be role=staff to pass the gate.
        const role = body.role ?? (regs.some((reg) => reg.staffRole) ? "staff" : "student");

        const { authUser, created } = await ensureAuthUser(email, `${firstName} ${lastName}`);

        const result = await database.transaction(async (tx) => {
          const [student] = await tx
            .insert(students)
            .values({
              studentId,
              email,
              firstName,
              lastName,
              nickname: body.nickname,
              role
            })
            .onConflictDoUpdate({
              target: students.studentId,
              set: {
                firstName,
                lastName,
                nickname: body.nickname,
                role
              }
            })
            .returning();

          const created_registrations: {
            project: string;
            staffRole: string | null;
            groupId: string | null;
          }[] = [];
          for (const reg of regs) {
            const [registration] = await tx
              .insert(registrations)
              .values({
                studentId: student.id,
                project: reg.project,
                pdpaAcceptedAt: new Date(),
                staffRole: reg.staffRole
              })
              .onConflictDoNothing({ target: [registrations.studentId, registrations.project] })
              .returning();

            if (!registration) continue; // already registered for this project

            // Mirror the real rpkm flow: registering creates a solo group.
            let groupId: string | null = null;
            if (reg.project === "rpkm" && (reg.withGroup ?? true)) {
              const [group] = await tx
                .insert(groups)
                .values({ leaderId: student.id, joinCode: generateJoinCode() })
                .returning();
              groupId = group.id;
              await tx
                .update(registrations)
                .set({ groupId })
                .where(eq(registrations.id, registration.id));
            }
            created_registrations.push({
              project: reg.project,
              staffRole: reg.staffRole ?? null,
              groupId
            });
          }

          return { student, created_registrations };
        });

        return status(
          201,
          successResponse({
            studentId: result.student.studentId,
            email,
            authUserId: authUser.id,
            authUserCreated: created,
            registrations: result.created_registrations
          })
        );
      },
      {
        detail: {
          tags: ["Dev"],
          description:
            "Creates a test persona: better-auth user (Google SSO bypassed) + students row, " +
            "optionally registered for firstdate/rpkm (rpkm gets a solo group like the real flow). " +
            "`staffRoles` expands into registrations — each role lands on the project whose " +
            "check-in gate reads it (firstdate → firstdate; rpkm/walkrally/freshmennight → rpkm), " +
            "so up to one role per project — and implies role=staff. " +
            "Idempotent — re-posting the same studentId updates the profile."
        },
        body: t.Object({
          studentId: tStudentIdParam,
          firstName: t.Optional(t.String()),
          lastName: t.Optional(t.String()),
          nickname: t.Optional(t.String()),
          role: t.Optional(t.Union([t.Literal("student"), t.Literal("staff")])),
          staffRoles: t.Optional(
            t.Array(tStaffRole, {
              description:
                "Staff roles to hold — expands into one registration per project " +
                "(firstdate role → firstdate registration; rpkm/walkrally/freshmennight → rpkm). " +
                "Sets role=staff unless `role` says otherwise. At most one role per project " +
                "(the DB stores a single staff_role per registration)."
            })
          ),
          registrations: t.Optional(
            t.Array(
              t.Object({
                project: tProject,
                staffRoles: t.Optional(t.Array(tStaffRole)),
                withGroup: t.Optional(
                  t.Boolean({ description: "rpkm only: create the solo group (default true)" })
                )
              })
            )
          )
        }),
        response: {
          201: tSuccessResponse(
            t.Object({
              studentId: t.String(),
              email: t.String(),
              authUserId: t.String(),
              authUserCreated: t.Boolean(),
              registrations: t.Array(
                t.Object({
                  project: t.String(),
                  staffRole: t.Nullable(t.String()),
                  groupId: t.Nullable(t.String())
                })
              )
            })
          ),
          ...tAppErrors("BAD_REQUEST")
        }
      }
    )
    .post(
      "/impersonate",
      async ({ body, cookie }) => {
        const studentId = body.studentId.toLowerCase();
        const email = emailFor(studentId);

        const { authUser, created } = await ensureAuthUser(email, `Dev ${studentId}`);

        // Impersonation should always land on a usable persona — make sure the
        // students row exists too (the auth macro derives studentId from the
        // session email, but most services resolve the students row next).
        if (created) {
          await database
            .insert(students)
            .values({ studentId, email, firstName: "Dev", lastName: studentId })
            .onConflictDoNothing({ target: students.studentId });
        }

        const { session, signedToken, sessionCookie } = await mintSession(authUser.id);

        // Same cookie name + attributes better-auth computed for this config,
        // so the frontend session behaves exactly like a real login.
        const sameSite = sessionCookie.attributes.sameSite;
        cookie[sessionCookie.name].set({
          value: signedToken,
          path: sessionCookie.attributes.path ?? "/",
          httpOnly: sessionCookie.attributes.httpOnly ?? true,
          secure: sessionCookie.attributes.secure ?? false,
          sameSite: typeof sameSite === "string" ? (sameSite.toLowerCase() as "lax") : sameSite,
          maxAge: sessionCookie.attributes.maxAge
        });

        return successResponse({
          studentId,
          email,
          userId: authUser.id,
          userCreated: created,
          // For header-based auth (bearer plugin): Authorization: Bearer <token>
          token: signedToken,
          expiresAt: session.expiresAt.toISOString(),
          cookieName: sessionCookie.name
        });
      },
      {
        detail: {
          tags: ["Dev"],
          description:
            "Mints a real better-auth session for the given studentId (auto-creates the persona " +
            "if missing). Sets the session cookie on the response AND returns the signed token " +
            "for `Authorization: Bearer` use. Call with credentials:'include' from the dev " +
            "banner, then reload — or store the token and send it as a bearer header."
        },
        body: t.Object({ studentId: tStudentIdParam }),
        response: {
          200: tSuccessResponse(
            t.Object({
              studentId: t.String(),
              email: t.String(),
              userId: t.String(),
              userCreated: t.Boolean(),
              token: t.String(),
              expiresAt: t.String(),
              cookieName: t.String()
            })
          )
        }
      }
    )
    .get(
      "/users",
      async () => {
        const rows = await database
          .select({ student: students, registration: registrations })
          .from(students)
          .leftJoin(registrations, eq(registrations.studentId, students.id))
          .orderBy(students.studentId);

        const byId = new Map<string, (typeof rows)[number]["student"]>();
        const regsByStudent = new Map<
          string,
          { project: string; staffRole: string | null; groupId: string | null }[]
        >();
        for (const row of rows) {
          byId.set(row.student.id, row.student);
          if (row.registration) {
            const list = regsByStudent.get(row.student.id) ?? [];
            list.push({
              project: row.registration.project,
              staffRole: row.registration.staffRole,
              groupId: row.registration.groupId
            });
            regsByStudent.set(row.student.id, list);
          }
        }

        return successResponse({
          users: [...byId.values()].map((student) => ({
            studentId: student.studentId,
            email: student.email,
            firstName: student.firstName,
            lastName: student.lastName,
            nickname: student.nickname,
            role: student.role,
            registrations: regsByStudent.get(student.id) ?? []
          }))
        });
      },
      {
        detail: {
          tags: ["Dev"],
          description: "Lists every persona (students row) for the dev banner's user picker."
        },
        response: { 200: tSuccessResponse(t.Object({ users: t.Array(tDevUser) })) }
      }
    )
    .delete(
      "/admin/users/:studentId",
      async ({ params }) => {
        const studentId = params.studentId.toLowerCase();
        const email = emailFor(studentId);

        await database.transaction(async (tx) => {
          const [student] = await tx
            .select({ id: students.id })
            .from(students)
            .where(eq(students.studentId, studentId));

          if (student) {
            // FK order: everything referencing students/registrations first
            // (mostly onDelete: restrict), then groups they lead, then the row.
            await tx.delete(scans).where(eq(scans.studentId, student.id));
            await tx
              .delete(entries)
              .where(or(eq(entries.studentId, student.id), eq(entries.scannedBy, student.id)));
            await tx
              .delete(walkRallyAttendances)
              .where(
                or(
                  eq(walkRallyAttendances.studentId, student.id),
                  eq(walkRallyAttendances.scannedBy, student.id)
                )
              );
            await tx
              .delete(walkRallyRegistrations)
              .where(eq(walkRallyRegistrations.studentId, student.id));
            // travel legs cascade with the registration rows.
            await tx.delete(registrations).where(eq(registrations.studentId, student.id));
            // Groups this student leads: members' registrations.groupId goes
            // null (onDelete: set null), house choices cascade.
            const led = await tx
              .select({ id: groups.id })
              .from(groups)
              .where(eq(groups.leaderId, student.id));
            if (led.length > 0) {
              await tx.delete(groups).where(
                inArray(
                  groups.id,
                  led.map((g) => g.id)
                )
              );
            }
            await tx.delete(students).where(eq(students.id, student.id));
          }

          // better-auth side: sessions/accounts cascade from the user row.
          await tx.delete(authUsers).where(eq(authUsers.email, email));
        });

        return successResponse({ deleted: true, studentId });
      },
      {
        detail: {
          tags: ["Dev"],
          description:
            "Wipes a persona completely (auth user + sessions, students row, registrations, " +
            "groups they lead, scans/attendances) so it can be recreated clean."
        },
        params: t.Object({ studentId: tStudentIdParam }),
        response: {
          200: tSuccessResponse(t.Object({ deleted: t.Literal(true), studentId: t.String() }))
        }
      }
    )
    .post(
      "/seed",
      async ({ body }) => {
        const houseCodes = body?.houses ?? DEFAULT_HOUSE_CODES;
        const activities = body?.activities ?? DEFAULT_ACTIVITIES;
        const checkpointDefs = body?.checkpoints ?? DEFAULT_CHECKPOINTS;

        const seeded = await database.transaction(async (tx) => {
          const insertedHouses = await tx
            .insert(houses)
            .values(houseCodes.map((code) => ({ code })))
            .onConflictDoNothing({ target: houses.code })
            .returning({ code: houses.code });

          const insertedActivities = await tx
            .insert(walkRallyActivities)
            .values(activities)
            .onConflictDoNothing({ target: walkRallyActivities.code })
            .returning({ code: walkRallyActivities.code });

          const insertedCheckpoints = await tx
            .insert(checkpoints)
            .values(checkpointDefs)
            .onConflictDoNothing({ target: checkpoints.code })
            .returning({ code: checkpoints.code });

          return {
            houses: insertedHouses.length,
            activities: insertedActivities.length,
            checkpoints: insertedCheckpoints.length
          };
        });

        return successResponse(seeded);
      },
      {
        detail: {
          tags: ["Dev"],
          description:
            "Seeds baseline fixtures on an empty database: 22 houses, the 8 walk-rally " +
            "activities, and game checkpoints. Idempotent (conflicts skipped). Default codes " +
            "are placeholders except `cu_museum` — pass real codes in the body if the frontend " +
            "i18n expects different ones."
        },
        body: t.Optional(
          t.Object({
            houses: t.Optional(t.Array(t.String(), { minItems: 1 })),
            activities: t.Optional(
              t.Array(
                t.Object({
                  code: t.String(),
                  kind: t.Union([t.Literal("workshop"), t.Literal("museum"), t.Literal("minigame")])
                }),
                { minItems: 1 }
              )
            ),
            checkpoints: t.Optional(
              t.Array(
                t.Object({
                  game: t.Union([t.Literal("jigsaw"), t.Literal("csr")]),
                  code: t.String(),
                  lat: t.Optional(t.Number()),
                  lng: t.Optional(t.Number())
                }),
                { minItems: 1 }
              )
            )
          })
        ),
        response: {
          200: tSuccessResponse(
            t.Object({ houses: t.Number(), activities: t.Number(), checkpoints: t.Number() })
          )
        }
      }
    );

export const devRoutes = createDevRoutes();
