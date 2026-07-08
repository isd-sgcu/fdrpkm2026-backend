import { count, eq, isNotNull } from "drizzle-orm";

import { type AppErrorCode, isFreshman } from "@src/utils";
import { db } from "@src/db";
import { groupHouseChoices, houses, registrations, type House } from "@src/db/schema";
import { isEventActive } from "@src/utils/flags";
import { GroupsService } from "@src/services/groups.service";

/**
 * "Model" layer for MVC — data access + business rules for houses
 * (project=rpkm). Routes in src/routes/rpkm/houses.ts call into this; they
 * never touch storage directly. See src/services/example.service.ts for the
 * reference shape (typed domain error, service owns storage).
 */

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class HousesServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

/** All houses. */
const listHouses = (): Promise<House[]> => db.select().from(houses);

/**
 * A single house by id.
 * @param id `houses.id` (uuid)
 * @throws {HousesServiceError} NOT_FOUND if no `houses` row matches
 */
const getHouse = async (id: string): Promise<House> => {
  const [house] = await db.select().from(houses).where(eq(houses.id, id));
  if (!house) throw new HousesServiceError("NOT_FOUND");

  return house;
};

type HouseStat = {
  houseId: string;
  code: string;
  count: number;
};

/**
 * Number of students who applied to each house — counts a group's rank-1
 * choice only, weighted by that group's member count (a group's whole
 * roster "applies" to its top pick, not just the leader).
 * @returns one entry per house (including zero-applicant houses), sorted by count descending
 */
const getHouseStats = async (): Promise<HouseStat[]> => {
  const allHouses = await db.select({ id: houses.id, code: houses.code }).from(houses);

  const topChoices = await db
    .select({ houseId: groupHouseChoices.houseId, groupId: groupHouseChoices.groupId })
    .from(groupHouseChoices)
    .where(eq(groupHouseChoices.rank, 1));

  const memberCounts = await db
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
 * @param studentId CUNET id (from authMiddleware)
 * @returns null if the group never got one (never picked houses, or
 *   registered/picked after the deadline — the draw skips both, so
 *   `assignedHouseId` stays null either way)
 * @throws {HousesServiceError} NOT_FRESHMEN, RESULT_NOT_ANNOUNCED if before
 *   the announce time, NOT_FOUND if the student or their group can't be resolved
 */
const getHouseResult = async (studentId: string): Promise<House | null> => {
  if (!isFreshman(studentId)) throw new HousesServiceError("NOT_FRESHMEN");
  if (!isEventActive("rpkm_house_result")) throw new HousesServiceError("RESULT_NOT_ANNOUNCED");

  let group;
  try {
    ({ group } = await GroupsService.getCurrentGroup(studentId));
  } catch (err) {
    if (err instanceof GroupsService.GroupsServiceError) throw new HousesServiceError(err.code);
    throw err;
  }
  if (!group.assignedHouseId) return null;

  return getHouse(group.assignedHouseId);
};

// Namespace object — routes call `HousesService.<fn>(...)` instead of
// importing individual functions.
export const HousesService = {
  HousesServiceError,
  listHouses,
  getHouse,
  getHouseStats,
  getHouseResult
};
