import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .use(authMiddleware)
  .get("/", () => ({ project: "rpkm" }), { auth: true });
