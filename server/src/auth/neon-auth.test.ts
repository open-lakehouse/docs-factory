// Unit tests for session-token extraction. Run with `bun test`.
//
// Neon Auth sets its session token in `__Secure-neonauth.session_token` (Secure,
// HttpOnly, SameSite=None). The resolver must find the token whether or not the
// `__Secure-`/`__Host-` prefix is present (so http dev and https prod share code),
// honor an Authorization: Bearer header, and respect a NEON_AUTH_COOKIE_NAME
// override — while still tolerating the secure prefix on top of the override.
import { expect, test, describe, afterEach } from "bun:test";
import { sessionToken } from "./neon-auth.js";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

const ORIGINAL = process.env.NEON_AUTH_COOKIE_NAME;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEON_AUTH_COOKIE_NAME;
  else process.env.NEON_AUTH_COOKIE_NAME = ORIGINAL;
});

describe("sessionToken", () => {
  test("reads the Neon Auth default cookie name", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    const h = headers({ cookie: "neonauth.session_token=abc123; other=x" });
    expect(sessionToken(h)).toBe("abc123");
  });

  test("tolerates the __Secure- prefix (HTTPS / production)", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    const h = headers({ cookie: "__Secure-neonauth.session_token=tok" });
    expect(sessionToken(h)).toBe("tok");
  });

  test("tolerates the __Host- prefix", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    const h = headers({ cookie: "__Host-neonauth.session_token=tok" });
    expect(sessionToken(h)).toBe("tok");
  });

  test("URL-decodes the cookie value", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    const h = headers({ cookie: "neonauth.session_token=a%20b%3Dc" });
    expect(sessionToken(h)).toBe("a b=c");
  });

  test("honors a custom NEON_AUTH_COOKIE_NAME override, with secure prefix", () => {
    process.env.NEON_AUTH_COOKIE_NAME = "neon-app.session_token";
    const plain = headers({ cookie: "neon-app.session_token=one" });
    expect(sessionToken(plain)).toBe("one");
    const secure = headers({ cookie: "__Secure-neon-app.session_token=two" });
    expect(sessionToken(secure)).toBe("two");
  });

  test("prefers a Bearer token over the cookie", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    const h = headers({
      authorization: "Bearer bearer-tok",
      cookie: "neonauth.session_token=cookie-tok",
    });
    expect(sessionToken(h)).toBe("bearer-tok");
  });

  test("returns undefined when neither header carries a token", () => {
    delete process.env.NEON_AUTH_COOKIE_NAME;
    expect(sessionToken(headers({}))).toBeUndefined();
    expect(sessionToken(headers({ cookie: "unrelated=x" }))).toBeUndefined();
  });
});
