import {
  generateJoinCode,
  getRegistrationMe,
  getRegistrationProfile,
  RegistrationServiceError,
  submitRegistration,
  type AuthUser,
  type GroupView,
  type MeResult,
  type ProfileResult,
  type RegisterDeps,
  type RegisterResult,
  type RegistrationInput
} from "./registration.service";

/**
 * "Model" layer for the RPKM registration flow (project=rpkm). Thin wrapper
 * over the shared registration core — RPKM auto-creates the solo group. See
 * `src/services/registration.service.ts` for the actual logic.
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

const getProfile = (
  authUser: AuthUser,
  deps: { db?: RegisterDeps["db"] } = {}
): Promise<ProfileResult> => getRegistrationProfile(authUser, "rpkm", deps);

// Namespace object — routes call `RpkmRegistrationService.<fn>(...)`. The error
// class is the shared one; the alias keeps the route's instanceof check stable.
export const RpkmRegistrationService = {
  RpkmRegistrationServiceError: RegistrationServiceError,
  registerRpkm,
  getMe,
  getProfile,
  generateJoinCode
};
