import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { groupRoute } from "./groups";
import { houseRoute } from "./houses";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .use(authMiddleware)
  .use(groupRoute)
  .use(houseRoute)
  .get("/", () => ({ project: "rpkm" }), { auth: true });
