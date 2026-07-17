import { type Static, type TSchema, t } from "elysia";

/**
 * AppErrorCode is an enum of error codes used in the application. Each error code corresponds to a specific HTTP status code and represents a common error scenario that may occur during API requests.
 */
// Sort ALPHABETICALLY by key name, not value, so that the enum is easier to read and maintain.
export const AppErrorCode = {
  /** 409: student already checked in to this project. */
  ALREADY_CHECKED_IN: 409,
  /** 409: checkpoint already scanned by this student (rpkm games). */
  ALREADY_COLLECTED: 409,
  /** 409: group already confirmed — cannot join it or change its membership. */
  ALREADY_CONFIRMED: 409,
  /** 409: user already registered for this project. */
  ALREADY_REGISTERED: 409,
  /** 400: request malformed or failed validation. */
  BAD_REQUEST: 400,
  /** 403: authenticated but not allowed to access resource. */
  FORBIDDEN: 403,
  /** 403: authenticated but caller is not staff. */
  FORBIDDEN_NOT_STAFF: 403,
  /** 403: rpkm checkpoint game (jigsaw/csr) is outside its play window. */
  GAME_CLOSED: 403,
  /** 409: target group already has the max number of members (4). */
  GROUP_FULL: 409,
  /** 409: house-pick deadline has passed — house preferences can no longer be changed. */
  HOUSE_PICK_CLOSED: 409,
  /** 500: unexpected server-side error, request could not be fulfilled. */
  INTERNAL_SERVER_ERROR: 500,
  /** 409: student already registered for this walk rally activity. */
  ACTIVITY_ALREADY_REGISTERED: 409,
  /** 404: walk rally activity code does not exist. */
  INVALID_ACTIVITY: 404,
  /** 409: student already holds the 6-point walk rally maximum. */
  POINTS_CAP_REACHED: 409,
  /** 403: outside the walk rally registration window (open/close). */
  REGISTRATION_CLOSED: 403,
  /** 409: student already has a registration with an overlapping time slot. */
  ROUND_CONFLICT: 409,
  /** 404: checkpoint code does not exist for the given rpkm game. */
  INVALID_CHECKPOINT: 404,
  /** 400: request body is not valid JSON. */
  INVALID_COOKIE_SIGNATURE: 403,
  /** 400: file type is not allowed. */
  INVALID_FILE_TYPE: 400,
  /** 400: `:gameType` is not a valid rpkm checkpoint game (jigsaw/csr). */
  INVALID_GAME_TYPE: 400,
  /** 404: join code does not match any group. */
  INVALID_JOIN_CODE: 404,
  /** 409: a leader with other members in their group can't join another group. */
  LEADER_HAS_MEMBERS: 409,
  /** 404: requested resource does not exist. */
  NOT_FOUND: 404,
  /** 403: user is not a freshmen, cannot access resource. */
  NOT_FRESHMEN: 403,
  /** 403: action requires being the group's leader. */
  NOT_LEADER: 403,
  /** 403: scan location is outside the checkpoint's geofence radius. */
  OUT_OF_GEOFENCE: 403,
  /** 403: house results haven't been announced yet. */
  RESULT_NOT_ANNOUNCED: 403,
  /** 404: student_id from QR does not match any student. */
  STUDENT_NOT_FOUND: 404,
  /** 401: request lacks valid authentication credentials. */
  UNAUTHORIZED: 401,
  /** 409: user already exists, cannot register again. */
  USER_ALREADY_EXISTS: 409,
  /** 400: request failed schema validation (body/params/query). Produced by
   * the global onError for Elysia VALIDATION errors — never thrown manually. */
  VALIDATION: 400
} as const;

/** Union of AppErrorCode key names, e.g. "NOT_FOUND". */
export type AppErrorCode = keyof typeof AppErrorCode;
/** Union of AppErrorCode HTTP status values. */
export type AppErrorCodeHttpValue = (typeof AppErrorCode)[AppErrorCode];

/**
 * Context schemas for error codes whose responses carry a payload beyond the
 * code itself. Registering a code here does two things:
 *  - `new AppError(code, context)` requires (and type-checks) that payload
 *  - `tAppErrors(code)` attaches the schema to the OpenAPI error response
 * Codes not listed take an optional free-form context.
 */
export const AppErrorContext = {
  ALREADY_CHECKED_IN: t.Object({
    scannedAt: t.Date(),
    scannedBy: t.String({ format: "uuid" })
  }),
  VALIDATION: t.Object({
    on: t.String({
      description: "Which part of the request failed validation",
      examples: ["body", "params", "query"]
    }),
    property: t.Optional(
      t.String({ description: "JSON pointer to the failing property", examples: ["/pdpaConsent"] })
    ),
    summary: t.Optional(t.String({ examples: ["Property 'pdpaConsent' should be true"] }))
  })
} as const satisfies Partial<Record<AppErrorCode, TSchema>>;

type ContextfulCode = keyof typeof AppErrorContext;

/** Context payload type for a given code: exact shape if registered in
 * {@link AppErrorContext}, otherwise an optional free-form object. */
export type AppErrorContextOf<C extends AppErrorCode> = C extends ContextfulCode
  ? Static<(typeof AppErrorContext)[C]>
  : Record<string, unknown> | undefined;

/**
 * Domain error thrown by services (and route guards). The global `onError`
 * handler in src/app.ts catches it and returns the standard
 * `{ success: false, error: { code, context? } }` envelope with the HTTP
 * status mapped from {@link AppErrorCode}.
 *
 * Codes registered in {@link AppErrorContext} require their typed payload;
 * every other code takes an optional free-form context.
 * @example
 *   throw new AppError("NOT_FOUND");
 *   throw new AppError("ALREADY_CHECKED_IN", { scannedAt, scannedBy }); // context required + typed
 */
export class AppError<C extends AppErrorCode = AppErrorCode> extends Error {
  readonly httpStatus: (typeof AppErrorCode)[C];
  readonly context: AppErrorContextOf<C>;

  constructor(
    readonly code: C,
    ...context: C extends ContextfulCode
      ? [context: Static<(typeof AppErrorContext)[C]>]
      : [context?: Record<string, unknown>]
  ) {
    super(code);
    this.name = "AppError";
    this.httpStatus = AppErrorCode[code];
    this.context = context[0] as AppErrorContextOf<C>;
  }
}
