import { Elysia } from "elysia";

import { authRoutes } from "./auth";
import { firstdateRoutes } from "./firstdate";
import { healthRoutes } from "./health";
import { rpkmRoutes } from "./rpkm";

export const apiRoutes = new Elysia({ prefix: "/api/v1" })
  .use(healthRoutes)
  .use(authRoutes)
  .use(firstdateRoutes)
  .use(rpkmRoutes);
