import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { registrationFields } from "../../src/models/registration-fields";

// Body-shape rules (pdpaConsent literal true, 1..4 travel legs, vehicleOther
// required when vehicle='other') live in the route body schema — Elysia
// rejects them as VALIDATION (400) before the handler runs, so the services
// no longer re-check them. These tests pin the schema contract itself; the
// FD/RPKM bodies both compose this shared base.
const bodySchema = registrationFields().registrationBody;

const leg = (over: Record<string, unknown> = {}) => ({
  vehicle: "bus" as const,
  originDistrict: "Mueang",
  originProvince: "Chiang Mai",
  destinationDistrict: "Bang Khen",
  destinationProvince: "Bangkok",
  ...over
});

const fullBody = (over: Record<string, unknown> = {}) => ({
  pdpaConsent: true,
  prefix: "mr",
  firstName: "Somchai",
  lastName: "Jaidee",
  nickname: "Chai",
  faculty: "21",
  phone: "0812345678",
  emergencyContactName: "Mae",
  emergencyContactPhone: "0898765432",
  allergies: null,
  dietary: null,
  medicalNotes: null,
  pnoSgcuAwareness: "instagram",
  pnoReferralSource: "friend",
  csoDistrict: "Suthep",
  csoProvince: "Chiang Mai",
  travelLegs: [leg()],
  ...over
});

describe("registration body schema", () => {
  it("accepts a valid full body", () => {
    expect(Value.Check(bodySchema, fullBody())).toBe(true);
  });

  it("rejects when pdpaConsent is not true", () => {
    expect(Value.Check(bodySchema, fullBody({ pdpaConsent: false }))).toBe(false);
  });

  it("rejects zero travel legs", () => {
    expect(Value.Check(bodySchema, fullBody({ travelLegs: [] }))).toBe(false);
  });

  it("rejects more than 4 travel legs", () => {
    expect(
      Value.Check(bodySchema, fullBody({ travelLegs: [leg(), leg(), leg(), leg(), leg()] }))
    ).toBe(false);
  });

  it("requires a non-blank vehicleOther when vehicle is 'other'", () => {
    expect(Value.Check(bodySchema, fullBody({ travelLegs: [leg({ vehicle: "other" })] }))).toBe(
      false
    );
    expect(
      Value.Check(
        bodySchema,
        fullBody({ travelLegs: [leg({ vehicle: "other", vehicleOther: "   " })] })
      )
    ).toBe(false);
    expect(
      Value.Check(
        bodySchema,
        fullBody({ travelLegs: [leg({ vehicle: "other", vehicleOther: "Songthaew" })] })
      )
    ).toBe(true);
  });

  it("allows omitting vehicleOther for non-'other' vehicles", () => {
    expect(Value.Check(bodySchema, fullBody({ travelLegs: [leg({ vehicleOther: null })] }))).toBe(
      true
    );
  });
});
