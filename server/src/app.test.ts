// Tests for createApp's CORS fail-closed guard. Run with `bun test`.
//
// The guard must refuse to build the app when NODE_ENV=production and
// ALLOWED_ORIGIN is unset/empty (which would otherwise serve permissive,
// credentialed CORS to any origin), while staying permissive in local dev.
// We drive it with AUTH_MODE=anon so selectProvider() needs no DB.
import { expect, test, describe, afterEach } from "bun:test";
import { createApp } from "./app.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("createApp CORS fail-closed", () => {
  test("throws in production when ALLOWED_ORIGIN is unset", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_ORIGIN;
    await expect(createApp()).rejects.toThrow(/ALLOWED_ORIGIN/);
  });

  test("throws in production when ALLOWED_ORIGIN is blank/empty", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGIN = " , ";
    await expect(createApp()).rejects.toThrow(/ALLOWED_ORIGIN/);
  });

  test("builds in production when ALLOWED_ORIGIN is set", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGIN = "https://example.com";
    const app = await createApp();
    expect(typeof app.fetch).toBe("function");
  });

  test("builds outside production even with no ALLOWED_ORIGIN (permissive dev echo)", async () => {
    process.env.AUTH_MODE = "anon";
    process.env.NODE_ENV = "development";
    delete process.env.ALLOWED_ORIGIN;
    const app = await createApp();
    expect(typeof app.fetch).toBe("function");
  });
});
