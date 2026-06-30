import { Elysia } from "elysia";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .get("/", () => ({ project: "rpkm" }));
