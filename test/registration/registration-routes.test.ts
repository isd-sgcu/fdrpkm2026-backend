import { describe, expect, it } from "bun:test";

import { createApp } from "../../src/app";

// Route-level test for the DTO validation → 422 envelope mapping (the onError
// handler on the registration route instances). Validation runs before the
// auth guard, so an invalid body is rejected as 422 without a session.
describe("registration routes — 422 validation envelope", () => {
  const post = (path: string, body: unknown) =>
    createApp().handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    );

  it("RPKM: invalid body -> 422 { success:false, error:{ code:'VALIDATION' } }", async () => {
    const res = await post("/v1/rpkm/users/registration", { pdpaConsent: "nope" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION", context: { message: "error_validation" } }
    });
  });

  it("FirstDate: invalid body -> 422 VALIDATION", async () => {
    const res = await post("/v1/fd/users/registration", { travelLegs: [] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "VALIDATION" } });
  });
});
