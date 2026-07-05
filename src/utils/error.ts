/**
 * AppErrorCode is an enum of error codes used in the application. Each error code corresponds to a specific HTTP status code and represents a common error scenario that may occur during API requests.
 */
// Sort ALPHABETICALLY by key name, not value, so that the enum is easier to read and maintain.
export const AppErrorCode = {
  /** 409: group already confirmed — cannot confirm again, join it, or change its membership. */
  ALREADY_CONFIRMED: "ALREADY_CONFIRMED",
  /** 409: user already registered for this project. */
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: "FORBIDDEN",
  /** 409: target group already has the max number of members (4). */
  GROUP_FULL: "GROUP_FULL",
  /** 409: group is confirmed — house preferences can no longer be changed. */
  HOUSE_PICK_CLOSED: "HOUSE_PICK_CLOSED",
  /** 400: fewer than 5 ranked house preferences set, cannot confirm yet. */
  HOUSE_PREF_INCOMPLETE: "HOUSE_PREF_INCOMPLETE",
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  /** 404: join code does not match any group. */
  INVALID_JOIN_CODE: "INVALID_JOIN_CODE",
  /** 409: a leader with other members in their group can't join another group. */
  LEADER_HAS_MEMBERS: "LEADER_HAS_MEMBERS",
  /** 404: requested resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** 403: user is not a freshmen, cannot access resource. */
  NOT_FRESHMEN: "NOT_FRESHMEN",
  /** 403: action requires being the group's leader. */
  NOT_LEADER: "NOT_LEADER",
  /** 400: PDPA consent is required but was not given. */
  PDPA_REQUIRED: "PDPA_REQUIRED",
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  /** 422: request body failed schema validation. */
  VALIDATION: "VALIDATION"
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode string values (same as keys here). */
export type AppErrorCodeValue = (typeof AppErrorCode)[AppErrorCode];
