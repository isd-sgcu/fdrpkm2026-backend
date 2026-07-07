import { eq } from "drizzle-orm";
import { checkinStudent } from "@src/services/checkin.helper";
import type { AppErrorCode } from "@src/utils";
import { db } from "@src/db";
import { houses, type House } from "@src/db/schema";

/**
 * "Model" layer for MVC — data access + business rules for RPKM
 * (project=rpkm). Routes in src/routes/rpkm call into this; they never
 * touch storage directly. See src/services/example.service.ts for the
 * reference shape (typed domain error, service owns storage).
 */

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class RpkmServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

const listHouses = (): Promise<House[]> => db.select().from(houses);

const getHouse = async (id: string): Promise<House> => {
  const [house] = await db.select().from(houses).where(eq(houses.id, id));
  if (!house) throw new RpkmServiceError("NOT_FOUND");

  return house;
};

const checkinRegistration = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "rpkm" });

const checkinFreshmenNight = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "freshmennight" });

export const RpkmService = {
  RpkmServiceError,
  listHouses,
  getHouse,
  checkinRegistration,
  checkinFreshmenNight
};
