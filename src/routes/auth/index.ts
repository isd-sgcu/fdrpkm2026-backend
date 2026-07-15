import { Elysia } from "elysia";
import { auth, deriveStudentId, AppError, errorResponse } from "@src/utils";

/**
 * better-auth is mounted at the root (its basePath is /v1/auth), which makes
 * this fetch handler the app's catch-all for every path no Elysia route
 * matches. Without the pathname guard, better-auth would answer all of those
 * with an empty-body 404 — so non-auth paths get the standard
 * `{ success: false, error: { code: "NOT_FOUND" } }` envelope instead. This
 * runs outside Elysia's error pipeline (raw fetch handler), so the Response
 * is built directly rather than thrown as an AppError.
 */
const mountHandler = (request: Request): Response | Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/v1/auth")) return auth.handler(request);

  return new Response(JSON.stringify(errorResponse("NOT_FOUND")), {
    status: 404,
    headers: { "content-type": "application/json" }
  });
};

export const authMiddleware = new Elysia({ name: "better-auth" }).mount(mountHandler).macro({
  auth: {
    async resolve({ request: { headers } }) {
      const session = await auth.api.getSession({
        headers
      });

      if (!session) throw new AppError("UNAUTHORIZED");

      const studentId = deriveStudentId(session.user.email);
      return {
        user: session.user,
        session: session.session,
        studentId
      };
    }
  }
});
