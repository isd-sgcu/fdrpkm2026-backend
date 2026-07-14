import { type TSchema, t } from "elysia";
import { AppErrorCode, AppErrorContext } from "./error";

export function successResponse<T extends Record<string, unknown>>(
  data: T
): { success: true; data: T };
export function successResponse<T extends Record<string, unknown>>(
  data: Promise<T>
): Promise<{ success: true; data: T }>;
export function successResponse<T extends Record<string, unknown>>(data: T | Promise<T>) {
  if (data instanceof Promise) {
    return data.then((resolved) => ({ success: true as const, data: resolved }));
  }
  return {
    success: true as const,
    data
  };
}

/**
 * Generates a standardized error response object for API responses.
 * @param code {@link AppErrorCode} enum value, e.g. "NOT_FOUND"
 * @param context optional additional data to include in the error response —
 *   must match the shape passed to {@link tErrorResponse}'s `context` schema
 *   for the same route, or Elysia will reject the response in dev.
 * @returns JSON object for use in API responses
 * @example
 *   return status(404, errorResponse(AppErrorCode.NOT_FOUND, { message: "Resource not found" }));
 *   // or
 *   return status(404, errorResponse("NOT_FOUND", { message: "Resource not found" }));
 */
export function errorResponse<T extends AppErrorCode>(
  code: T,
  context?: Record<string, unknown>
): { success: false; error: { code: T; context: Record<string, unknown> | undefined } };
export function errorResponse<T extends AppErrorCode>(
  code: T,
  context: Promise<Record<string, unknown>>
): Promise<{ success: false; error: { code: T; context: Record<string, unknown> } }>;
export function errorResponse<T extends AppErrorCode>(
  code: T,
  context?: Record<string, unknown> | Promise<Record<string, unknown>>
) {
  if (context instanceof Promise) {
    return context.then((resolved) => ({
      success: false as const,
      error: {
        code,
        context: resolved
      }
    }));
  }
  return {
    success: false as const,
    error: {
      code,
      context
    }
  };
}

/**
 * Generates a standardized success response schema for API responses.
 * @param data TypeBox schema for the data to be returned in the success response
 * @returns TypeBox schema for the success response
 * @example
 *    response: {
 *      200: tSuccessResponse(t.Object({ name: t.String() }))
 *    }
 */
export function tSuccessResponse<T extends TSchema>(data: T) {
  return t.Object({
    success: t.Literal(true, {
      title: "Success",
      example: true
    }),
    data
  });
}

/**
 * Generates a standardized error response schema for API responses.
 * @param code {@link AppErrorCode} enum value, e.g. "NOT_FOUND"
 * @param context optional TypeBox schema for additional error context
 * @returns TypeBox schema for the error response
 * @example
 *    response: {
 *      404: tErrorResponse(AppErrorCode.NOT_FOUND, t.Object({ message: t.String() }))
 *    }
 *    // or
 *    response: {
 *      404: tErrorResponse("NOT_FOUND", t.Object({ message: t.String() }))
 *    }
 */
export function tErrorResponse<T extends TSchema, U extends AppErrorCode>(code: U, context?: T) {
  const errorSchema = context
    ? t.Object({ code: t.Literal(code), context })
    : t.Object({ code: t.Literal(code) });

  return t.Object({
    success: t.Literal(false, {
      title: "Success",
      example: false
    }),
    error: errorSchema
  });
}

/**
 * Builds the error half of a route's `response` schema map from the
 * {@link AppErrorCode}s its handler (or the services it calls) can throw.
 * HTTP statuses are derived from AppErrorCode; codes sharing a status are
 * merged into a t.Union. Context schemas registered in {@link AppErrorContext}
 * are attached automatically.
 * @example
 *   response: {
 *     200: tSuccessResponse(t.Object({ name: t.String() })),
 *     ...tAppErrors("UNAUTHORIZED", "NOT_FOUND", "GROUP_FULL", "ALREADY_CONFIRMED")
 *   }
 */
export function tAppErrors<C extends AppErrorCode>(
  ...codes: C[]
): { [S in (typeof AppErrorCode)[C]]: TSchema } {
  const byStatus = new Map<number, TSchema[]>();
  for (const code of codes) {
    const context = (AppErrorContext as Partial<Record<AppErrorCode, TSchema>>)[code];
    const schemas = byStatus.get(AppErrorCode[code]) ?? [];
    schemas.push(tErrorResponse(code, context));
    byStatus.set(AppErrorCode[code], schemas);
  }

  const result: Record<number, TSchema> = {};
  for (const [status, schemas] of byStatus) {
    result[status] = schemas.length === 1 ? schemas[0] : t.Union(schemas);
  }
  return result as { [S in (typeof AppErrorCode)[C]]: TSchema };
}
