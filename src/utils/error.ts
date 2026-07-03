export const AppErrorCode = {
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: "FORBIDDEN",
  /** 404: requested resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS"
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode string values (same as keys here). */
export type AppErrorCodeValue = (typeof AppErrorCode)[AppErrorCode];
