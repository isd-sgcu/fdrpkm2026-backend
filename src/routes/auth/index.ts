import { Elysia } from "elysia";
import { auth, errorResponse, deriveStudentId } from "@src/utils";

export const authMiddleware = new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({
        headers
      });

      if (!session) return status(401, errorResponse("UNAUTHORIZED"));

      const studentId = deriveStudentId(session.user.email);
      return {
        user: session.user,
        session: session.session,
        studentId
      };
    }
  }
});
