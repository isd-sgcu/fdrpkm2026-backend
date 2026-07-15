import { Elysia } from "elysia";

import { devRoutes } from "./dev";
import { firstdateRoutes } from "./firstdate";
import { firstdateUserRoutes } from "./firstdate/users";
import { healthRoutes } from "./health";
import { rpkmRoutes } from "./rpkm";
import { rpkmUserRoutes } from "./rpkm/users";
import { exampleRoutes } from "./example";

const isDev = process.env.NODE_ENV === "development";

export const apiRoutes = new Elysia({ prefix: "/v1" })
  .use(isDev ? exampleRoutes : new Elysia())
  // Dev tooling (persona creation, impersonation, seeding) — never mounted in
  // production; additionally guarded by the x-dev-key header (see dev.ts).
  .use(isDev ? devRoutes : new Elysia())
  .use(healthRoutes)
  .use(firstdateRoutes)
  .use(firstdateUserRoutes)
  .use(rpkmRoutes)
  .use(rpkmUserRoutes);
