import { and, count, countDistinct, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { Gauge } from "prom-client";

import { db } from "@src/db";
import {
  checkpoints,
  entries,
  groupHouseChoices,
  groups,
  houses,
  registrations,
  scans,
  session,
  students,
  travelLegs,
  walkRallyActivities,
  walkRallyAttendances,
  walkRallyRegistrations
} from "@src/db/schema";
import { logger } from "@src/utils/logger";
import { metricsRegistry } from "@src/utils/metrics";

/**
 * DB-state gauges: current truth read from Cloud SQL at scrape time, unlike
 * the counters in metrics.ts which count events since the last restart. Every
 * app instance reports the same values (query the dashboards with `max by`),
 * and totals survive deploys/restarts — which is why insert-only facts
 * (registrations, check-ins, scans, attendances) live here and not as
 * counters.
 *
 * All gauges share one TTL-cached refresh so a scrape costs at most one batch
 * of aggregate queries per REFRESH_TTL_MS regardless of scrape interval.
 */

const REFRESH_TTL_MS = 30_000;

let lastRefreshAt = 0;
let inflight: Promise<void> | null = null;

// Every gauge triggers the same guarded refresh; within one scrape (and one
// TTL window) only the first actually queries, the rest await it.
const collect = async (): Promise<void> => {
  if (Date.now() - lastRefreshAt < REFRESH_TTL_MS) return;
  inflight ??= refresh()
    // A failed refresh must not fail the whole scrape — serve stale values and
    // retry after the TTL. The counters and HTTP metrics stay live regardless.
    .catch((error: unknown) => {
      logger.warn("metrics_db_refresh_failed", {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    })
    .finally(() => {
      lastRefreshAt = Date.now();
      inflight = null;
    });
  await inflight;
};

const gauge = (name: string, help: string, labelNames: string[] = []) =>
  new Gauge({ name, help, labelNames, registers: [metricsRegistry], collect });

const studentsGauge = gauge(
  "fdrpkm_students",
  "Students known to the system (SSO'd at least once)"
);
const registrationsGauge = gauge(
  "fdrpkm_registrations",
  "Event registrations currently in the database, by project",
  ["project"]
);
const checkinsGauge = gauge(
  "fdrpkm_checkins",
  "Entry scans (staff check-ins) in the database, by project",
  ["project"]
);
const groupsGauge = gauge("fdrpkm_groups", "RPKM friend groups");
const groupsAssignedGauge = gauge(
  "fdrpkm_groups_assigned",
  "RPKM groups already assigned a house by the draw"
);
const groupSizeGauge = gauge("fdrpkm_group_size_groups", "RPKM groups by member count", ["size"]);
const houseDemandGauge = gauge(
  "fdrpkm_house_demand",
  "Groups that picked a house at a given preference rank",
  ["house", "rank"]
);
const houseDemandStudentsGauge = gauge(
  "fdrpkm_house_demand_students",
  "Students in groups that picked a house at a given preference rank",
  ["house", "rank"]
);
const houseCapacityGauge = gauge("fdrpkm_house_capacity", "Configured house capacity", ["house"]);
const walkRallySlotGauge = gauge(
  "fdrpkm_walkrally_slot_registrations",
  "Walk-rally pre-registrations per activity round (capacity is 30/slot)",
  ["activity", "round"]
);
const walkRallyAttendanceGauge = gauge(
  "fdrpkm_walkrally_attendances",
  "Walk-rally attendance scans, by activity and source (preregis vs onsite walk-in)",
  ["activity", "source"]
);
const gameScansGauge = gauge("fdrpkm_game_scans", "Checkpoint collections, by game", ["game"]);
const gamePlayersGauge = gauge(
  "fdrpkm_game_players",
  "Students who collected at least one checkpoint, by game",
  ["game"]
);
const travelLegsGauge = gauge("fdrpkm_travel_legs", "Registered travel legs, by vehicle", [
  "vehicle"
]);
const activeSessionsGauge = gauge("fdrpkm_active_sessions", "Unexpired better-auth sessions");
const registrationsUngroupedGauge = gauge(
  "fdrpkm_registrations_ungrouped",
  "RPKM freshman registrations not yet in a friend group"
);
const houseAssignedStudentsGauge = gauge(
  "fdrpkm_house_assigned_students",
  "Students whose group was assigned to a house, by house (compare with fdrpkm_house_capacity)",
  ["house"]
);
const staffRegistrationsGauge = gauge(
  "fdrpkm_staff_registrations",
  "Staff registrations, by staff role",
  ["staff_role"]
);
const groupsConfirmedGauge = gauge(
  "fdrpkm_groups_confirmed",
  "RPKM groups locked after the house draw (confirmedAt set)"
);
const checkpointScansGauge = gauge(
  "fdrpkm_checkpoint_scans",
  "Scans per checkpoint; a checkpoint stuck at 0 while others climb is likely a dead QR",
  ["game", "checkpoint"]
);
const attendedDaysGauge = gauge(
  "fdrpkm_attended_days",
  "RPKM registrations by attended day count",
  ["days"]
);
const studentsByRoleGauge = gauge(
  "fdrpkm_students_by_role",
  "Students by role (student vs staff); fdrpkm_students stays the overall total",
  ["role"]
);

async function refresh(): Promise<void> {
  // Sub-select: member count per group (membership lives on
  // registrations.groupId). Outer query buckets groups by that size.
  const groupSizes = db
    .select({ groupId: registrations.groupId, size: count().as("size") })
    .from(registrations)
    .where(isNotNull(registrations.groupId))
    .groupBy(registrations.groupId)
    .as("group_sizes");

  const [
    studentRows,
    registrationRows,
    checkinRows,
    groupRows,
    groupSizeRows,
    houseRows,
    houseDemandRows,
    walkRallySlotRows,
    walkRallyAttendanceRows,
    gameRows,
    travelLegRows,
    sessionRows,
    ungroupedRows,
    houseAssignedRows,
    staffRegistrationRows,
    checkpointScanRows,
    attendedDaysRows,
    studentRoleRows
  ] = await Promise.all([
    db.select({ n: count() }).from(students),
    db
      .select({ project: registrations.project, n: count() })
      .from(registrations)
      .groupBy(registrations.project),
    db.select({ project: entries.project, n: count() }).from(entries).groupBy(entries.project),
    db
      .select({
        total: count(),
        assigned: count(groups.assignedHouseId),
        confirmed: count(groups.confirmedAt)
      })
      .from(groups),
    db.select({ size: groupSizes.size, n: count() }).from(groupSizes).groupBy(groupSizes.size),
    db.select({ house: houses.code, capacity: houses.capacity }).from(houses),
    db
      .select({
        house: houses.code,
        rank: groupHouseChoices.rank,
        groups: countDistinct(groupHouseChoices.groupId),
        students: count(registrations.id)
      })
      .from(groupHouseChoices)
      .innerJoin(houses, eq(groupHouseChoices.houseId, houses.id))
      .leftJoin(
        registrations,
        and(eq(registrations.groupId, groupHouseChoices.groupId), eq(registrations.project, "rpkm"))
      )
      .groupBy(houses.code, groupHouseChoices.rank),
    db
      .select({
        activity: walkRallyActivities.code,
        round: walkRallyRegistrations.round,
        n: count()
      })
      .from(walkRallyRegistrations)
      .innerJoin(walkRallyActivities, eq(walkRallyRegistrations.activityId, walkRallyActivities.id))
      .groupBy(walkRallyActivities.code, walkRallyRegistrations.round),
    db
      .select({
        activity: walkRallyActivities.code,
        source: walkRallyAttendances.source,
        n: count()
      })
      .from(walkRallyAttendances)
      .innerJoin(walkRallyActivities, eq(walkRallyAttendances.activityId, walkRallyActivities.id))
      .groupBy(walkRallyActivities.code, walkRallyAttendances.source),
    db
      .select({
        game: checkpoints.game,
        scans: count(),
        players: countDistinct(scans.studentId)
      })
      .from(scans)
      .innerJoin(checkpoints, eq(scans.checkpointId, checkpoints.id))
      .groupBy(checkpoints.game),
    db
      .select({ vehicle: travelLegs.vehicle, n: count() })
      .from(travelLegs)
      .groupBy(travelLegs.vehicle),
    db
      .select({ n: count() })
      .from(session)
      .where(gt(session.expiresAt, sql`now()`)),
    // staffRole is never set on grouped freshmen registrations, but staff also
    // never join groups — exclude them so this counts freshmen only.
    db
      .select({ n: count() })
      .from(registrations)
      .where(
        and(
          eq(registrations.project, "rpkm"),
          isNull(registrations.groupId),
          isNull(registrations.staffRole)
        )
      ),
    db
      .select({ house: houses.code, n: count() })
      .from(registrations)
      .innerJoin(groups, eq(registrations.groupId, groups.id))
      .innerJoin(houses, eq(groups.assignedHouseId, houses.id))
      .groupBy(houses.code),
    db
      .select({ staffRole: registrations.staffRole, n: count() })
      .from(registrations)
      .where(isNotNull(registrations.staffRole))
      .groupBy(registrations.staffRole),
    // LEFT JOIN from checkpoints so a checkpoint nobody scanned reports 0
    // instead of disappearing — that's the dead-QR signal.
    db
      .select({ game: checkpoints.game, checkpoint: checkpoints.code, n: count(scans.id) })
      .from(checkpoints)
      .leftJoin(scans, eq(scans.checkpointId, checkpoints.id))
      .groupBy(checkpoints.game, checkpoints.code),
    db
      .select({ days: registrations.attendedDays, n: count() })
      .from(registrations)
      .where(isNotNull(registrations.attendedDays))
      .groupBy(registrations.attendedDays),
    db.select({ role: students.role, n: count() }).from(students).groupBy(students.role)
  ]);

  studentsGauge.set(Number(studentRows[0]?.n ?? 0));
  activeSessionsGauge.set(Number(sessionRows[0]?.n ?? 0));
  groupsGauge.set(Number(groupRows[0]?.total ?? 0));
  groupsAssignedGauge.set(Number(groupRows[0]?.assigned ?? 0));
  groupsConfirmedGauge.set(Number(groupRows[0]?.confirmed ?? 0));
  registrationsUngroupedGauge.set(Number(ungroupedRows[0]?.n ?? 0));

  // Reset before set so label combinations that dropped to zero rows (e.g. all
  // size-4 groups dissolved) don't keep reporting their last value forever.
  registrationsGauge.reset();
  for (const r of registrationRows) registrationsGauge.set({ project: r.project }, Number(r.n));

  checkinsGauge.reset();
  for (const r of checkinRows) checkinsGauge.set({ project: r.project }, Number(r.n));

  groupSizeGauge.reset();
  for (const r of groupSizeRows) groupSizeGauge.set({ size: String(r.size) }, Number(r.n));

  houseCapacityGauge.reset();
  houseDemandGauge.reset();
  houseDemandStudentsGauge.reset();
  for (const r of houseRows) {
    if (r.capacity !== null) houseCapacityGauge.set({ house: r.house }, r.capacity);
  }
  for (const r of houseDemandRows) {
    const labels = { house: r.house, rank: String(r.rank) };
    houseDemandGauge.set(labels, Number(r.groups));
    houseDemandStudentsGauge.set(labels, Number(r.students));
  }

  walkRallySlotGauge.reset();
  for (const r of walkRallySlotRows) {
    walkRallySlotGauge.set({ activity: r.activity, round: String(r.round) }, Number(r.n));
  }

  walkRallyAttendanceGauge.reset();
  for (const r of walkRallyAttendanceRows) {
    walkRallyAttendanceGauge.set({ activity: r.activity, source: r.source }, Number(r.n));
  }

  gameScansGauge.reset();
  gamePlayersGauge.reset();
  for (const r of gameRows) {
    gameScansGauge.set({ game: r.game }, Number(r.scans));
    gamePlayersGauge.set({ game: r.game }, Number(r.players));
  }

  travelLegsGauge.reset();
  for (const r of travelLegRows) travelLegsGauge.set({ vehicle: r.vehicle }, Number(r.n));

  houseAssignedStudentsGauge.reset();
  for (const r of houseAssignedRows) {
    houseAssignedStudentsGauge.set({ house: r.house }, Number(r.n));
  }

  staffRegistrationsGauge.reset();
  for (const r of staffRegistrationRows) {
    if (r.staffRole !== null) staffRegistrationsGauge.set({ staff_role: r.staffRole }, Number(r.n));
  }

  checkpointScansGauge.reset();
  for (const r of checkpointScanRows) {
    checkpointScansGauge.set({ game: r.game, checkpoint: r.checkpoint }, Number(r.n));
  }

  attendedDaysGauge.reset();
  for (const r of attendedDaysRows) {
    if (r.days !== null) attendedDaysGauge.set({ days: String(r.days) }, Number(r.n));
  }

  studentsByRoleGauge.reset();
  for (const r of studentRoleRows) studentsByRoleGauge.set({ role: r.role }, Number(r.n));
}
