import { type RpkmProfileResult } from "@src/models/rpkm-registration.model";
import { checkinStudent, getCheckinStatus } from "@src/services/checkin.helper";
import { db } from "@src/db";
import {
  getRegistrationMe,
  getRegistrationProfile,
  submitRegistration,
  updateRegistrationProfile,
  type AuthUser,
  type GroupView,
  type MeResult,
  type RegisterDeps,
  type RegisterResult,
  type RegistrationInput
} from "./registration.service";

/**
 * "Model" layer for MVC — data access + business rules for RPKM
 * (project=rpkm, freshmennight). Routes in src/routes/rpkm call into this;
 * they never touch storage directly.
 *
 * Registration/profile logic is a thin wrapper over the shared registration
 * core (see registration.service.ts) — RPKM auto-creates the solo group.
 */

// RPKM always creates a solo group, so `group` is non-null (the core returns
// it nullable to also serve FirstDate, which has none).
type RpkmRegisterResult = RegisterResult & { group: GroupView };

const registerRpkm = async (
  authUser: AuthUser,
  input: RegistrationInput,
  deps: RegisterDeps = {}
): Promise<RpkmRegisterResult> => {
  const result = await submitRegistration(
    authUser,
    input,
    { project: "rpkm", createSoloGroup: true },
    deps
  );
  return { ...result, group: result.group! };
};

const getMe = (authUser: AuthUser, deps: { db?: RegisterDeps["db"] } = {}): Promise<MeResult> =>
  getRegistrationMe(authUser, "rpkm", deps);

const getProfile = async (
  authUser: AuthUser,
  deps: { db?: RegisterDeps["db"] } = {}
): Promise<RpkmProfileResult> => {
  const { user, registration, travelLegs, group } = await getRegistrationProfile(
    authUser,
    "rpkm",
    deps
  );
  if (registration) {
    return {
      user,
      registration: {
        pdpaConsent: registration.pdpaConsent,
        pnoReferralSource: registration.pnoReferralSource,
        attendedDays: registration.attendedDays ?? null
      },
      travelLegs,
      group
    };
  }
  return { user, registration: null, travelLegs, group };
};

const updateProfile = async (
  authUser: AuthUser,
  input: Partial<RegistrationInput>,
  deps: RegisterDeps = {}
): Promise<RpkmProfileResult> => {
  const { user, registration, travelLegs, group } = await updateRegistrationProfile(
    authUser,
    "rpkm",
    input,
    deps
  );
  if (registration) {
    return {
      user,
      registration: {
        pdpaConsent: registration.pdpaConsent,
        pnoReferralSource: registration.pnoReferralSource,
        attendedDays: registration.attendedDays ?? null
      },
      travelLegs,
      group
    };
  }
  return { user, registration: null, travelLegs, group };
};

const checkinRegistration = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "rpkm" }, { db });

const checkinFreshmenNight = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "freshmennight" }, { db });

const getRegistrationCheckinStatus = (studentCunetId: string) =>
  getCheckinStatus({ studentCunetId, project: "rpkm" }, { db });

const getFreshmenNightCheckinStatus = (studentCunetId: string) =>
  getCheckinStatus({ studentCunetId, project: "freshmennight" }, { db });

// Namespace object — routes call `RpkmService.<fn>(...)`. The error class is
// the shared registration core's; the alias keeps the route's instanceof
// check stable.
export const RpkmService = {
  registerRpkm,
  getMe,
  getProfile,
  updateProfile,
  checkinRegistration,
  checkinFreshmenNight,
  getRegistrationCheckinStatus,
  getFreshmenNightCheckinStatus
};
