import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { gameRoute } from "./games";
import { groupRoute } from "./groups";
import { houseRoute } from "./houses";
import { rpkmCheckinRoutes } from "./checkin";
import { walkRallyRoute } from "./walk-rally";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .use(authMiddleware)
  .use(rpkmCheckinRoutes)
  .use(groupRoute)
  .use(houseRoute)
  .use(gameRoute)
  .use(walkRallyRoute);
