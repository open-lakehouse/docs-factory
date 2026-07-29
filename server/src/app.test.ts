// Tests for createApp's CORS policy. Run with `bun test`.
//
// CORS is a browser concern: it governs which cross-origin browser requests get
// their Origin reflected, and must NEVER gate whether the app runs. So createApp
// always builds; the policy lives in the `origin` resolver:
//   - allowlist set        → reflect only listed origins
//   - unset + production    → reflect NOTHING (deny cross-origin browsers), but the
//                             app still serves same-origin + server-to-server
//   - unset + non-prod      → permissive echo (dev convenience)
// A server-to-server caller (no Origin header, e.g. RegisterVersion) is never
// blocked, which is what regressed when this was a startup throw.
// We drive it with AUTH_MODE=anon so selectProvider() needs no DB.
import { expect, test, describe, afterEach } from "bun:test";
import { createApp } from "./app.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/** A preflight for a cross-origin browser request; returns the reflected origin (or null). */
async function reflectedOrigin(app: Awaited<ReturnType<typeof createApp>>, origin: string) {
  const res = await app.request("/healthz", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  return res.headers.get("access-control-allow-origin");
}

describe("createApp CORS policy", () => {
  test("production + unset allowlist: app builds and serves, but reflects no browser origin", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_ORIGIN;
    const app = await createApp();
    // App runs (server-to-server / same-origin unaffected)…
    const health = await app.request("/healthz");
    expect(health.status).toBe(200);
    // …but a cross-origin browser request gets nothing reflected (fail closed).
    expect(await reflectedOrigin(app, "https://evil.example.com")).toBeNull();
  });

  test("production + blank/empty allowlist behaves like unset", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGIN = " , ";
    const app = await createApp();
    expect(await reflectedOrigin(app, "https://evil.example.com")).toBeNull();
  });

  test("production + allowlist set: reflects a listed origin, denies others", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGIN = "https://docs.example.com";
    const app = await createApp();
    expect(await reflectedOrigin(app, "https://docs.example.com")).toBe("https://docs.example.com");
    expect(await reflectedOrigin(app, "https://evil.example.com")).toBeNull();
  });

  test("non-production + unset allowlist: permissive echo (dev convenience)", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "development";
    delete process.env.ALLOWED_ORIGIN;
    const app = await createApp();
    expect(await reflectedOrigin(app, "http://localhost:5173")).toBe("http://localhost:5173");
  });
});
