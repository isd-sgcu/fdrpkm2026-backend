/**
 * AppErrorCode is an enum of error codes used in the application. Each error code corresponds to a specific HTTP status code and represents a common error scenario that may occur during API requests.
 */
// Sort ALPHABETICALLY by key name, not value, so that the enum is easier to read and maintain.
export const AppErrorCode = {
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: "FORBIDDEN",
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  /** 404: requested resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** 403: user is not a freshmen, cannot access resource. */
  NOT_FRESHMEN: "NOT_FRESHMEN",
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS"
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode string values (same as keys here). */
export type AppErrorCodeValue = (typeof AppErrorCode)[AppErrorCode];
