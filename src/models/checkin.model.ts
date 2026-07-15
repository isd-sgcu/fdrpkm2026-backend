import { tSuccessResponse } from "@src/utils";
import { Elysia, t } from "elysia";

const entry = t.Object({
  id: t.String({ format: "uuid", title: "Entry ID" }),
  project: t.String({ title: "Project" }),
  studentId: t.String({ format: "uuid", title: "Student ID" }),
  scannedBy: t.String({ format: "uuid", title: "Scanned By (Staff ID)" }),
  scannedAt: t.Date({ title: "Scanned At" }),
  createdAt: t.Date({ title: "Created At" }),
  updatedAt: t.Date({ title: "Updated At" })
});

const checkinBody = t.Object({
  student_id: t.String({ minLength: 1 })
});

export const CheckinModel = new Elysia().model({
  Entry: entry,
  CheckinBody: checkinBody,
  SuccessCheckinResponse: tSuccessResponse(entry)
});
