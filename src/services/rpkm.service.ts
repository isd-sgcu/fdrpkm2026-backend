import type { AppErrorCode } from "@src/utils";

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

// Namespace object — routes call `RpkmService.<fn>(...)` instead of
// importing individual functions. Add functions here as real logic lands.
export const RpkmService = {
  RpkmServiceError
};
