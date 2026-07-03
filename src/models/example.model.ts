import { Elysia, t } from "elysia";

/**
 * In this file, we define the ExampleModel using Elysia. This model can be used to define the structure and behavior of example data in our application.
 * You can add properties, methods, and validation rules to this model as needed.
 *
 * Note: This is a placeholder model and should be customized based on the specific requirements of your application.
 */

export const ExampleModel = new Elysia()
  .model({
    userName: t.String({
      title: "User Name",
      description: "The name of the user",
      example: "John Doe"
    }),
    userEmail: t.String({
      title: "User Email",
      description: "The email address of the user",
      example: "example@student.chula.ac.th",
      format: "email"
    }),
    userRole: t.Enum(
      {
        student: "STUDENT",
        staff: "STAFF"
      },
      {
        title: "User Role",
        description: "Role of the user in the system",
        example: "STUDENT"
      }
    ),
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
      // You can use `t.Ref` to reference the previously defined types in the model, ensuring consistency and reusability.
      name: t.Ref("userName"),
      email: t.Ref("userEmail", {
        // And you can override properties of the referenced type if needed.
        description: "The email address of the user (must be a valid email format)"
      }),
      role: t.Ref("userRole")
    }),
    userUpdateBody: t.Object({
      name: t.Ref("userName"),
      email: t.Ref("userEmail"),
      id: t.String({
        format: "uuid",
        title: "User ID"
      }),
      role: t.Ref("userRole")
    })
  })
  .prefix("EM#"); // Prefix for OpenAPI docs and type-safe validation. You can change this prefix to anything you like, or omit it entirely if you prefer.
