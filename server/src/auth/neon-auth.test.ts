// Unit tests for the Neon Auth provider. Run with `bun test`.
//
// The resolver validates the request by forwarding cookies to Neon Auth's
// get-session endpoint (no cookie parsing / SQL of our own), then looks the
// user's email up in reviewer_allowlist. We stub global fetch to script the
// get-session / list-accounts / allowlist responses, and stub the db() allowlist
// query, so no network or database is touched.
import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";

// The provider calls db() for the allowlist lookup; stub both so no DB is needed.
// These tests exercise identity resolution, not the allowlist (see allowlist.ts
// tests) — lookupRole returns ANONYMOUS so we can assert the authenticated
// identity fields the provider sets regardless of role.
mock.module("../db.js", () => ({ db: () => ({}) }));
mock.module("../allowlist.js", () => ({ lookupRole: async () => Role.ANONYMOUS }));
const { createNeonAuthProvider } = await import("./neon-auth.js");

const realFetch = globalThis.fetch;
const ORIGINAL_BASE = process.env.NEON_AUTH_BASE;

type Json = unknown;
function jsonResponse(status: number, body: Json): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Route stubbed fetch by URL suffix.
function stubFetch(routes: { getSession?: Response; listAccounts?: Response; githubUser?: Response }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/auth/get-session")) return routes.getSession ?? jsonResponse(401, {});
    if (url.endsWith("/api/auth/list-accounts")) return routes.listAccounts ?? jsonResponse(200, []);
    if (url.includes("api.github.com/user")) return routes.githubUser ?? jsonResponse(404, {});
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE = "https://ep-x.neonauth.example.aws.neon.tech";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIGINAL_BASE === undefined) delete process.env.NEON_AUTH_BASE;
  else process.env.NEON_AUTH_BASE = ORIGINAL_BASE;
});

const headers = () => new Headers({ cookie: "__Secure-neonauth.session_token=tok" });

describe("createNeonAuthProvider.verify", () => {
  test("no session → anonymous viewer", async () => {
    stubFetch({ getSession: jsonResponse(401, {}) });
    const v = await createNeonAuthProvider().verify(headers());
    expect(v.authenticated).toBe(false);
    expect(v.role).toBe(Role.ANONYMOUS);
  });

  test("NEON_AUTH_BASE unset → anonymous (not yet provisioned)", async () => {
    delete process.env.NEON_AUTH_BASE;
    // fetch should never be called; make it throw to prove that.
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called when base is unset");
    }) as unknown as typeof fetch;
    const v = await createNeonAuthProvider().verify(headers());
    expect(v.authenticated).toBe(false);
  });

  test("valid session, GitHub login resolved → authenticated, login is @handle", async () => {
    stubFetch({
      getSession: jsonResponse(200, { user: { id: "u1", email: "a@b.com", name: "Alice" } }),
      listAccounts: jsonResponse(200, [{ providerId: "github", accessToken: "gho_x" }]),
      githubUser: jsonResponse(200, { login: "alice-gh" }),
    });
    const v = await createNeonAuthProvider().verify(headers());
    expect(v.authenticated).toBe(true);
    expect(v.login).toBe("alice-gh");
    expect(v.userId).toBe("u1");
    expect(v.name).toBe("Alice");
  });

  test("valid session, GitHub lookup fails → falls back to email as display", async () => {
    stubFetch({
      getSession: jsonResponse(200, { user: { id: "u2", email: "c@d.com", name: "Bob" } }),
      listAccounts: jsonResponse(500, {}),
    });
    const v = await createNeonAuthProvider().verify(headers());
    expect(v.authenticated).toBe(true);
    expect(v.login).toBe("c@d.com");
  });
});
