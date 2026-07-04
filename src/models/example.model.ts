import { Elysia, t } from "elysia";

/**
 * In this file, we define the ExampleModel using Elysia. This model can be used to define the structure and behavior of example data in our application.
 * You can add properties, methods, and validation rules to this model as needed.
 *
 * Note: This is a placeholder model and should be customized based on the specific requirements of your application.
 */

// Field schemas defined as plain consts and reused directly (not via
// t.Ref) — t.Ref's type resolution doesn't survive the route's
// `.prefix("model", "Example.")` rename, which collapsed `body` to
// `unknown` at the type level (validation still worked at runtime, only
// TS inference broke).
const userName = t.String({
  title: "User Name",
  description: "The name of the user",
  example: "John Doe"
});
const userEmail = t.String({
  title: "User Email",
  description: "The email address of the user",
  example: "example@student.chula.ac.th",
  format: "email"
});
const userRole = t.Enum(
  {
    student: "STUDENT",
    staff: "STAFF"
  },
  {
    title: "User Role",
    description: "Role of the user in the system",
    example: "STUDENT"
  }
);

export const ExampleModel = new Elysia().model({
  userName,
  userEmail,
  userRole,
  userUpdateParams: t.Object({
    userId: t.String({
      format: "uuid",
      title: "User ID",
      description: "The unique identifier of the user"
    })
  }),
  // Request body for POST /user/:userId — same fields as userUpdateBody
  // minus `id` (that comes from the URL param, not the body).
  userUpdateRequestBody: t.Object({
    name: userName,
    email: t.String({
      ...userEmail,
      description: "The email address of the user (must be a valid email format)"
    }),
    role: userRole
  }),
  userUpdateBody: t.Object({
    name: userName,
    email: userEmail,
    id: t.String({
      format: "uuid",
      title: "User ID"
    }),
    role: userRole
  })
});
// No self-prefix here — the consuming route (src/routes/example.ts) applies
// its own namespace via `.use(ExampleModel).prefix("model", "Example.")`.
// Elysia's `.prefix()` needs (type, word), not a single string; a bare
// `.prefix("EM#")` call is a type error (TS2554) and would be redundant
// with the route's own prefixing anyway.
