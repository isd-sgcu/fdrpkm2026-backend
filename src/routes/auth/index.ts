import { Elysia } from "elysia";
import { auth, deriveStudentId, AppError } from "@src/utils";

export const authMiddleware = new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
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
