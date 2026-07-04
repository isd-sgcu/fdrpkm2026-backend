import type { TObject, TProperties } from "@sinclair/typebox";

/**
 * Elysia's Drizzle integration guide (elysiajs.com/integrations/drizzle)
 * recommends a `spread` helper so a `createSelectSchema`/`createInsertSchema`
 * result's fields can be reused directly in `t.Object({...})` (e.g. to
 * compose a subset, or mix DB fields with extra ones) without repeating
 * `t.Pick`/`t.Omit` everywhere. drizzle-typebox itself doesn't ship one, so
 * this is the same shape, scoped to the schema (not raw table) case we use.
 */
export const spread = <T extends TProperties>(schema: TObject<T>): T => schema.properties;

export const spreads = <T extends Record<string, TObject>>(
  schemas: T
): { [K in keyof T]: T[K]["properties"] } => {
  const result = {} as { [K in keyof T]: T[K]["properties"] };
  for (const key in schemas) result[key] = schemas[key].properties;
  return result;
};
