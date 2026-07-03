import { Elysia } from "elysia";

/**
 * Chula SSO (CAS). One combined backend behind two API hosts:
 *   fd-api.rpkm2026.com   -> project 'firstdate'
 *   rpkm-api.rpkm2026.com -> project 'rpkm'
 *
 * We never send custom data through SSO. The project is derived from the
 * incoming Host header, and the CAS `service` / return URL is built from that
 * same host — so a login started on fd-api returns to fd-api, rpkm to rpkm.
 */
export const projectFromHost = (host: string | undefined): "firstdate" | "rpkm" => {
  if (host?.startsWith("fd-api.")) return "firstdate";
  if (host?.startsWith("rpkm-api.")) return "rpkm";
  throw new Error(`Unknown API host: ${host}`);
};

export const authRoutes = new Elysia({ prefix: "/auth" })
  // build the CAS login redirect; service/return URL = this host's callback
  .get("/login", ({ request }) => {
    const host = request.headers.get("host") ?? undefined;
    projectFromHost(host);
    const returnUrl = `https://${host}/api/v1/auth/callback`;
    const loginUrl = new URL("https://account.it.chula.ac.th/login");
    loginUrl.searchParams.set("service", returnUrl);

    return Response.redirect(loginUrl.toString());
  })
  // CAS redirects back here on the same host -> project known from Host
  .get("/callback", ({ request }) => {
    const host = request.headers.get("host") ?? undefined;
    const project = projectFromHost(host);
    // TODO: validate CAS ticket -> student_id; upsert students; ensure registration(project)
    return { project, todo: "validate ticket, upsert student, ensure registration" };
  });
