// Unit tests for session-token extraction. Run with `bun test`.
//
// Neon Auth sets its session token in `__Secure-neonauth.session_token` (Secure,
// HttpOnly, SameSite=None). The resolver must find the token whether or not the
// `__Secure-`/`__Host-` prefix is present (so http dev and https prod share code)
// and honor an Authorization: Bearer header.
import { expect, test, describe } from "bun:test";
import { sessionToken } from "./neon-auth.js";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("sessionToken", () => {
  test("reads the Neon Auth default cookie name", () => {
    const h = headers({ cookie: "neonauth.session_token=abc123; other=x" });
    expect(sessionToken(h)).toBe("abc123");
  });

  test("tolerates the __Secure- prefix (HTTPS / production)", () => {
    const h = headers({ cookie: "__Secure-neonauth.session_token=tok" });
    expect(sessionToken(h)).toBe("tok");
  });

  test("tolerates the __Host- prefix", () => {
    const h = headers({ cookie: "__Host-neonauth.session_token=tok" });
    expect(sessionToken(h)).toBe("tok");
  });

  test("URL-decodes the cookie value", () => {
    const h = headers({ cookie: "neonauth.session_token=a%20b%3Dc" });
    expect(sessionToken(h)).toBe("a b=c");
  });

  test("prefers a Bearer token over the cookie", () => {
    const h = headers({
      authorization: "Bearer bearer-tok",
      cookie: "neonauth.session_token=cookie-tok",
    });
    expect(sessionToken(h)).toBe("bearer-tok");
  });

  test("returns undefined when neither header carries a token", () => {
    expect(sessionToken(headers({}))).toBeUndefined();
    expect(sessionToken(headers({ cookie: "unrelated=x" }))).toBeUndefined();
  });
});
