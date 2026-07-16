import { describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { requestLogger } from "../src/plugins/request-logger";
import { logger } from "../src/utils/logger";

interface LogEntry {
  severity: string;
  message: string;
  time?: string;
  traceId?: string;
  route?: string;
  durationMs?: number;
  httpRequest?: {
    requestMethod: string;
    requestUrl: string;
    status: number;
    latency?: string;
  };
  [key: string]: unknown;
}

// Parse the JSON lines a write-spy captured, skipping any non-JSON noise (e.g.
// the test runner's own stdout writes captured while the spy is active).
const parseEntries = (spy: { mock: { calls: unknown[][] } }): LogEntry[] =>
  spy.mock.calls
    .map((call) => String(call[0]))
    .flatMap((text) => {
      try {
        return [JSON.parse(text) as LogEntry];
      } catch {
        return [];
      }
    });

// onAfterResponse runs after the response resolves; give it a tick to fire.
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

describe("logger", () => {
  it("emits a structured JSON line with severity, message, time and fields", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.info("hello", { foo: "bar" });
    const entries = parseEntries(spy);
    spy.mockRestore();

    const entry = entries.find((e) => e.message === "hello");
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe("INFO");
    expect(entry?.foo).toBe("bar");
    expect(typeof entry?.time).toBe("string");
  });

  it("drops entries below the configured LOG_LEVEL (debug < info)", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.debug("should be dropped");
    const dropped = parseEntries(spy).filter((e) => e.message === "should be dropped");
    spy.mockRestore();

    expect(dropped).toHaveLength(0);
  });

  it("writes ERROR severity to stderr, not stdout", () => {
    const errSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.error("boom", { errorMessage: "kaboom" });
    const entries = parseEntries(errSpy);
    errSpy.mockRestore();

    const entry = entries.find((e) => e.message === "boom");
    expect(entry?.severity).toBe("ERROR");
    expect(entry?.errorMessage).toBe("kaboom");
  });

  it("child() stamps bound fields (e.g. traceId) onto every entry", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.child({ traceId: "trace-abc" }).info("scoped");
    const entries = parseEntries(spy);
    spy.mockRestore();

    const entry = entries.find((e) => e.message === "scoped");
    expect(entry?.traceId).toBe("trace-abc");
  });
});

describe("requestLogger plugin", () => {
  // Mirror the real app wiring: onError is registered BEFORE the plugin, so the
  // access log's onAfterResponse resolves the final (post-onError) status.
  const makeApp = () =>
    new Elysia()
      .onError(({ code, status }) => {
        if (code === "NOT_FOUND") return status(404, { error: "not found" });
        return status(500, { error: "boom" });
      })
      .use(requestLogger)
      .get("/ping", () => "pong")
      .get("/explode", () => {
        throw new Error("kaboom");
      });

  // Capture both streams (INFO/WARN -> stdout, ERROR -> stderr), drive one
  // request, and return the parsed access-log entries.
  const hit = async (path: string, headers?: Record<string, string>) => {
    const app = makeApp();
    const outSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const errSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const res = await app.handle(new Request(`http://localhost${path}`, { headers }));
    await res.text();
    await tick();
    const entries = [...parseEntries(outSpy), ...parseEntries(errSpy)];
    outSpy.mockRestore();
    errSpy.mockRestore();
    return { res, entries };
  };

  it("logs a 200 at INFO with method, route, status, traceId and duration", async () => {
    const { res, entries } = await hit("/ping");

    expect(res.status).toBe(200);
    const access = entries.find((e) => e.httpRequest?.requestUrl === "/ping");
    expect(access).toBeDefined();
    expect(access?.httpRequest?.requestMethod).toBe("GET");
    expect(access?.httpRequest?.status).toBe(200);
    expect(access?.route).toBe("/ping");
    expect(access?.severity).toBe("INFO");
    expect(typeof access?.traceId).toBe("string");
    expect(typeof access?.durationMs).toBe("number");
  });

  it("logs an unhandled error as 500 at ERROR severity", async () => {
    const { res, entries } = await hit("/explode");

    expect(res.status).toBe(500);
    const access = entries.find((e) => e.httpRequest?.requestUrl === "/explode");
    expect(access?.httpRequest?.status).toBe(500);
    expect(access?.severity).toBe("ERROR");
  });

  it("logs a not-found as 404 at WARNING severity", async () => {
    const { res, entries } = await hit("/nope");

    expect(res.status).toBe(404);
    const access = entries.find((e) => e.httpRequest?.requestUrl === "/nope");
    expect(access?.httpRequest?.status).toBe(404);
    expect(access?.severity).toBe("WARNING");
  });

  it("uses the X-Cloud-Trace-Context header as the trace id", async () => {
    const { entries } = await hit("/ping", { "X-Cloud-Trace-Context": "abc123def456/789;o=1" });

    const access = entries.find((e) => e.httpRequest?.requestUrl === "/ping");
    expect(access?.traceId).toBe("abc123def456");
  });
});
