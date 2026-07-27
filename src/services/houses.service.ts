import { and, count, eq, isNotNull } from "drizzle-orm";

import { AppError, isFreshman } from "@src/utils";
import { ROUND2_HOUSE_CODES } from "@src/constants";
import { db as defaultDb, type Database } from "@src/db";
import { groupHouseChoices, houses, registrations, type House } from "@src/db/schema";
import { isEventActive } from "@src/utils/flags";
import { GroupsService } from "@src/services/groups.service";

/**
 * "Model" layer for MVC — data access + business rules for houses
 * (project=rpkm). Routes in src/routes/rpkm/houses.ts call into this; they
 * never touch storage directly. See src/services/example.service.ts for the
 * reference shape (typed domain error, service owns storage).
 */

export type HousesDeps = { db?: Database };

type HouseWithAvailability = House & { availableInRound2: boolean };

/**
 * All houses, tagged with whether they're pickable in round 2. Round-2
 * houses hide their capacity (want-more-freshmen houses shouldn't broadcast
 * how under-filled they are) — demand instead comes from
 * `getHouseStats(2)`, which counts round-2 rank-1 picks.
 */
const listHouses = async (deps: HousesDeps = {}): Promise<HouseWithAvailability[]> => {
  const database = deps.db ?? defaultDb;
  const allHouses = await database.select().from(houses);
  return allHouses.map((house) => {
    const availableInRound2 = ROUND2_HOUSE_CODES.includes(house.code);
    return {
      ...house,
      capacity: availableInRound2 ? null : house.capacity,
      availableInRound2
    };
  });
};

/**
 * A single house by id.
 * @param id `houses.id` (uuid)
 * @throws {AppError} NOT_FOUND if no `houses` row matches
 */
const getHouse = async (id: string, deps: HousesDeps = {}): Promise<House> => {
  const database = deps.db ?? defaultDb;
  const [house] = await database.select().from(houses).where(eq(houses.id, id));
  if (!house) throw new AppError("NOT_FOUND");

  return house;
};

type HouseStat = {
  houseId: string;
  code: string;
  count: number;
};

/**
 * Number of students who applied to each house — counts a group's rank-1
 * choice only for the given round, weighted by that group's member count (a
 * group's whole roster "applies" to its top pick, not just the leader).
 * @param round which round's picks to count (defaults to round 1)
 * @returns one entry per house (including zero-applicant houses), sorted by count descending
 */
const getHouseStats = async (round: 1 | 2 = 1, deps: HousesDeps = {}): Promise<HouseStat[]> => {
  const database = deps.db ?? defaultDb;
  const allHouses = await database.select({ id: houses.id, code: houses.code }).from(houses);

  const topChoices = await database
    .select({ houseId: groupHouseChoices.houseId, groupId: groupHouseChoices.groupId })
    .from(groupHouseChoices)
    .where(and(eq(groupHouseChoices.rank, 1), eq(groupHouseChoices.round, round)));

  const memberCounts = await database
    .select({ groupId: registrations.groupId, count: count() })
    .from(registrations)
    .where(isNotNull(registrations.groupId))
    .groupBy(registrations.groupId);
  const memberCountByGroup = new Map(memberCounts.map((row) => [row.groupId, row.count]));

  const countByHouse = new Map<string, number>();
  for (const choice of topChoices) {
    const members = memberCountByGroup.get(choice.groupId) ?? 0;
    countByHouse.set(choice.houseId, (countByHouse.get(choice.houseId) ?? 0) + members);
  }

  return allHouses
    .map((house) => ({
      houseId: house.id,
      code: house.code,
      count: countByHouse.get(house.id) ?? 0
    }))
    .sort((a, b) => b.count - a.count);
};

/**
 * The current student's group's assigned house, once results are announced.
 * Gated by the round-1 announce window unless the group actually
 * participated in round 2 (has round-2 picks on file), in which case the
 * later round-2 announce window applies instead — so a round-2 result can't
 * leak before its own announce time just because round 1's (open-ended)
 * window is already active.
 * @param studentId CUNET id (from authMiddleware)
 * @returns null if the group never got one (never picked houses, or
 *   registered/picked after the deadline — the draw skips both, so
 *   `assignedHouseId` stays null either way)
 * @throws {AppError} NOT_FRESHMEN, RESULT_NOT_ANNOUNCED if before
 *   the announce time, NOT_FOUND if the student or their group can't be resolved
 */
const getHouseResult = async (studentId: string, deps: HousesDeps = {}): Promise<House | null> => {
  if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");

  const { group } = await GroupsService.getCurrentGroup(studentId, deps);
  const database = deps.db ?? defaultDb;
  const [round2Choice] = await database
    .select({ id: groupHouseChoices.id })
    .from(groupHouseChoices)
    .where(and(eq(groupHouseChoices.groupId, group.id), eq(groupHouseChoices.round, 2)));
  const announceEvent = round2Choice ? "rpkm_house_result_round2" : "rpkm_house_result";
  if (!isEventActive(announceEvent)) throw new AppError("RESULT_NOT_ANNOUNCED");

  if (!group.assignedHouseId) return null;

  return getHouse(group.assignedHouseId, deps);
};

// Namespace object — routes call `HousesService.<fn>(...)` instead of
// importing individual functions.
export const HousesService = {
  listHouses,
  getHouse,
  getHouseStats,
  getHouseResult
};
