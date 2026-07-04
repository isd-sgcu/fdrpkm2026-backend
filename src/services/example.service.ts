import type { AppErrorCode } from "@src/utils";

/**
 * "Model" layer for MVC — owns data access + business rules for a feature.
 * Routes (controllers, src/routes/*) call into this; they never touch
 * storage directly. Swap the in-memory Map below for real Drizzle queries
 * (see src/db) when wiring an actual feature — keep the same function
 * signatures so the controller doesn't need to change.
 */

export type ExampleUser = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "STAFF";
};

const store = new Map<string, ExampleUser>();

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class ExampleServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

const getExampleUser = (id: string): ExampleUser => {
  const user = store.get(id);
  if (!user) throw new ExampleServiceError("NOT_FOUND");

  return user;
};

const upsertExampleUser = (input: ExampleUser): ExampleUser => {
  store.set(input.id, input);

  return input;
};

const deleteExampleUser = (id: string): void => {
  // eslint-disable-next-line drizzle/enforce-delete-with-where -- Map.delete, not a Drizzle query; rule can't tell the two apart
  if (!store.delete(id)) throw new ExampleServiceError("NOT_FOUND");
};

// Namespace object — routes call `ExampleService.getExampleUser(...)` instead
// of importing individual functions, so every feature's service is reached
// through one consistent name (mirrors ExampleModel/FirstDateService/RpkmService).
export const ExampleService = {
  ExampleServiceError,
  getExampleUser,
  upsertExampleUser,
  deleteExampleUser
};
