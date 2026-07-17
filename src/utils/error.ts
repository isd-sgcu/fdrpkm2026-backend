/**
 * AppErrorCode is an enum of error codes used in the application. Each error code corresponds to a specific HTTP status code and represents a common error scenario that may occur during API requests.
 */
// Sort ALPHABETICALLY by key name, not value, so that the enum is easier to read and maintain.
export const AppErrorCode = {
  /** 409: student already checked in to this project. */
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  /** 409: checkpoint already scanned by this student (rpkm games). */
  ALREADY_COLLECTED: "ALREADY_COLLECTED",
  /** 409: group already confirmed — cannot join it or change its membership. */
  ALREADY_CONFIRMED: "ALREADY_CONFIRMED",
  /** 409: user already registered for this project. */
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: "FORBIDDEN",
  /** 403: authenticated but caller is not staff. */
  FORBIDDEN_NOT_STAFF: "FORBIDDEN_NOT_STAFF",
  /** 403: rpkm checkpoint game (jigsaw/csr) is outside its play window. */
  GAME_CLOSED: "GAME_CLOSED",
  /** 409: target group already has the max number of members (4). */
  GROUP_FULL: "GROUP_FULL",
  /** 409: house-pick deadline has passed — house preferences can no longer be changed. */
  HOUSE_PICK_CLOSED: "HOUSE_PICK_CLOSED",
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  /** 404: checkpoint code does not exist for the given rpkm game. */
  INVALID_CHECKPOINT: "INVALID_CHECKPOINT",
  /** 400: `:gameType` is not a valid rpkm checkpoint game (jigsaw/csr). */
  INVALID_GAME_TYPE: "INVALID_GAME_TYPE",
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
  /** 403: scan location is outside the checkpoint's geofence radius. */
  OUT_OF_GEOFENCE: "OUT_OF_GEOFENCE",
  /** 400: PDPA consent is required but was not given. */
  PDPA_REQUIRED: "PDPA_REQUIRED",
  /** 403: house results haven't been announced yet. */
  RESULT_NOT_ANNOUNCED: "RESULT_NOT_ANNOUNCED",
  /** 404: student_id from QR does not match any student. */
  STUDENT_NOT_FOUND: "STUDENT_NOT_FOUND",
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS"
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode string values (same as keys here). */
export type AppErrorCodeValue = (typeof AppErrorCode)[AppErrorCode];
