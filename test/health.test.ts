import { describe, expect, it } from "bun:test";

import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns service health", async () => {
    const app = createApp();
    const response = await app.handle(new Request("http://localhost/api/v1/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "fdrpkm2026-backend"
    });
  });
});
