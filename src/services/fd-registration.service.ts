import {
  getRegistrationMe,
  RegistrationServiceError,
  submitRegistration,
  type AuthUser,
  type MeResult,
  type RegisterDeps,
  type RegisterResult,
  type RegistrationInput
} from "./registration.service";

/**
 * "Model" layer for the FirstDate registration flow (project=firstdate). Thin
 * wrapper over the shared registration core — FirstDate has no groups, so no
 * solo group is created and `group` is dropped from the returned shapes
 * (registrations.group_id stays null). See src/services/registration.service.ts.
 */

// FirstDate results never carry a group.
export type FdRegisterResult = Omit<RegisterResult, "group">;
export type FdMeResult = Omit<MeResult, "group">;

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
  const { user, registration, travelLegs } = await getRegistrationMe(authUser, "firstdate", deps);
  return { user, registration, travelLegs };
};

// Namespace object — routes call `FdRegistrationService.<fn>(...)`.
export const FdRegistrationService = {
  FdRegistrationServiceError: RegistrationServiceError,
  registerFd,
  getMe
};
