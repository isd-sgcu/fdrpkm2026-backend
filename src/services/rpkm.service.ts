import { eq } from "drizzle-orm";

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

// Namespace object — routes call `RpkmService.<fn>(...)` instead of
// importing individual functions. Add functions here as real logic lands.
export const RpkmService = {
  RpkmServiceError,
  listHouses,
  getHouse
};
