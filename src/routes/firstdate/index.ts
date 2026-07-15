import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { fdCheckinRoutes } from "./checkin";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (entries, project=firstdate).
 */
export const firstdateRoutes = new Elysia({ prefix: "/fd" })
  .use(authMiddleware)
  .use(fdCheckinRoutes);
