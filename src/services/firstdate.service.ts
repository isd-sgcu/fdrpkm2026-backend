import type { AppErrorCode } from "@src/utils";

/**
 * "Model" layer for MVC — data access + business rules for FirstDate
 * (project=firstdate). Routes in src/routes/firstdate call into this;
 * they never touch storage directly. See src/services/example.service.ts
 * for the reference shape (typed domain error, service owns storage).
 */

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class FirstDateServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

const getFirstDateProfile = (user: { name: string }): { name: string } => ({
  name: user.name
});

// Namespace object — routes call `FirstDateService.getFirstDateProfile(...)`
// instead of importing individual functions.
export const FirstDateService = {
  FirstDateServiceError,
  getFirstDateProfile
};
