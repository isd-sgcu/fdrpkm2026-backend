import { checkinStudent } from "@src/services/checkin.helper";
import { db } from "@src/db";

/**
 * "Model" layer for MVC — check-in logic for RPKM (project=rpkm,
 * freshmennight). Routes in src/routes/rpkm call into this; they never
 * touch storage directly.
 */

const checkinRegistration = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "rpkm" }, { db });

const checkinFreshmenNight = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "freshmennight" }, { db });

export const RpkmCheckinService = {
  checkinRegistration,
  checkinFreshmenNight
};
