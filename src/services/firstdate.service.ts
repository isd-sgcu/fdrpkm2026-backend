import { type FdProfileResult } from "@src/models/fd-registration.model";
import { checkinStudent, getCheckinStatus } from "@src/services/checkin.helper";
import { db } from "@src/db";
import {
  getRegistrationMe,
  getRegistrationProfile,
  submitRegistration,
  updateRegistrationProfile,
  type AuthUser,
  type MeResult,
  type RegisterDeps,
  type RegisterResult,
  type RegistrationInput
} from "./registration.service";

/**
 * "Model" layer for MVC — data access + business rules for FirstDate
 * (project=firstdate). Routes in src/routes/firstdate call into this; they
 * never touch storage directly.
 *
 * Registration/profile logic is a thin wrapper over the shared registration
 * core (see registration.service.ts) — FirstDate has no groups, so no solo
 * group is created and `group` is dropped from the returned shapes
 * (registrations.group_id stays null).
 */

// FirstDate results never carry a group.
export type FdRegisterResult = Omit<RegisterResult, "group">;
export type FdMeResult = MeResult;

const registerFd = async (
  authUser: AuthUser,
  input: RegistrationInput,
  deps: RegisterDeps = {}
): Promise<FdRegisterResult> => {
  const { userId, registrationId } = await submitRegistration(
    authUser,
    input,
    { project: "firstdate", createSoloGroup: false },
    deps
  );
  return { userId, registrationId };
};

const getMe = async (
  authUser: AuthUser,
  deps: { db?: RegisterDeps["db"] } = {}
): Promise<FdMeResult> => {
  return getRegistrationMe(authUser, "firstdate", deps);
};

const getProfile = async (
  authUser: AuthUser,
  deps: { db?: RegisterDeps["db"] } = {}
): Promise<FdProfileResult> => {
  const { user, registration, travelLegs } = await getRegistrationProfile(
    authUser,
    "firstdate",
    deps
  );
  if (registration) {
    return {
      user,
      registration: {
        pdpaConsent: registration.pdpaConsent,
        pnoReferralSource: registration.pnoReferralSource
      },
      travelLegs
    };
  }
  return { user, registration: null, travelLegs };
};

const updateProfile = async (
  authUser: AuthUser,
  input: Partial<RegistrationInput>,
  deps: RegisterDeps = {}
): Promise<FdProfileResult> => {
  const { user, registration, travelLegs } = await updateRegistrationProfile(
    authUser,
    "firstdate",
    input,
    deps
  );
  if (registration) {
    return {
      user,
      registration: {
        pdpaConsent: registration.pdpaConsent,
        pnoReferralSource: registration.pnoReferralSource
      },
      travelLegs
    };
  }
  return { user, registration: null, travelLegs };
};

const getFirstDateProfile = (user: { name: string }): { name: string } => ({
  name: user.name
});

const checkinFirstDate = (staffCunetId: string, studentCunetId: string) =>
  checkinStudent({ studentCunetId, staffCunetId, project: "firstdate" }, { db });

const getFirstDateCheckinStatus = (studentCunetId: string) =>
  getCheckinStatus({ studentCunetId, project: "firstdate" }, { db });

// Namespace object — routes call `FirstDateService.<fn>(...)`. The error
// class is the shared registration core's; the alias keeps the route's
// instanceof check stable.
export const FirstDateService = {
  registerFd,
  getMe,
  getProfile,
  updateProfile,
  getFirstDateProfile,
  checkinFirstDate,
  getFirstDateCheckinStatus
};
