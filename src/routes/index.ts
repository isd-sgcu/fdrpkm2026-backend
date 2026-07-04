import { Elysia } from "elysia";

import { firstdateRoutes } from "./firstdate";
import { healthRoutes } from "./health";
import { rpkmRoutes } from "./rpkm";
import { exampleRoutes } from "./example";

const isDev = process.env.NODE_ENV === "development";

export const apiRoutes = new Elysia({ prefix: "/v1" })
  .use(isDev ? exampleRoutes : new Elysia())
  .use(healthRoutes)
  .use(firstdateRoutes)
  .use(rpkmRoutes);
