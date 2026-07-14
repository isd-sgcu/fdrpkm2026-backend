import { Elysia } from "elysia";
import { successResponse, tAppErrors } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FirstDateService } from "@src/services/firstdate.service";
import { CheckinModel } from "@src/models/checkin.model";

export const fdCheckinRoutes = new Elysia({ prefix: "/checkin" })
  .use(authMiddleware)
  .use(CheckinModel)
  .prefix("model", "Checkin.")
  .post(
    "/registration",
    async ({ body, studentId }) =>
      successResponse(FirstDateService.checkinFirstDate(studentId, body.student_id)),
    {
      auth: true,
      body: "Checkin.CheckinBody",
      response: {
        200: "Checkin.SuccessCheckinResponse",
        ...tAppErrors(
          "UNAUTHORIZED",
          "FORBIDDEN_NOT_STAFF",
          "STUDENT_NOT_FOUND",
          "ALREADY_CHECKED_IN"
        )
      }
    }
  );
