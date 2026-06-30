import { Elysia } from "elysia";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (fd_entries).
 */
export const firstdateRoutes = new Elysia({ prefix: "/firstdate" })
  .get("/", () => ({ project: "firstdate" }));
