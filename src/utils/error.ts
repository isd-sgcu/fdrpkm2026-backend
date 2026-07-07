/**
 * AppErrorCode is an enum of error codes used in the application. Each error code corresponds to a specific HTTP status code and represents a common error scenario that may occur during API requests.
 */
// Sort ALPHABETICALLY by key name, not value, so that the enum is easier to read and maintain.
export const AppErrorCode = {
  /** 409: student already checked in to this project. */
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: "FORBIDDEN",
  /** 403: authenticated but caller is not staff. */
  FORBIDDEN_NOT_STAFF: "FORBIDDEN_NOT_STAFF",
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  /** 404: requested resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** 403: user is not a freshmen, cannot access resource. */
  NOT_FRESHMEN: "NOT_FRESHMEN",
  /** 400: PDPA consent is required but was not given. */
  PDPA_REQUIRED: "PDPA_REQUIRED",
  /** 404: student_id from QR does not match any student. */
  STUDENT_NOT_FOUND: "STUDENT_NOT_FOUND",
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  /** 422: request body failed schema validation. */
  VALIDATION: "VALIDATION",
  /** 422: payload failed shape/format validation. */
  VALIDATION_ERROR: "VALIDATION_ERROR"
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode string values (same as keys here). */
export type AppErrorCodeValue = (typeof AppErrorCode)[AppErrorCode];
