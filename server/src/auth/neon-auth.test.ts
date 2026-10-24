// Unit tests for session-token extraction + the site-admin role elevation. Run
// with `bun test`.
//
// Neon Auth sets its session token in `__Secure-neonauth.session_token` (Secure,
// HttpOnly, SameSite=None). The resolver must find the token whether or not the
// `__Secure-`/`__Host-` prefix is present (so http dev and https prod share code)
// and honor an Authorization: Bearer header.
import { describe, expect, test } from "bun:test";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import type { UserIdentityRow } from "./github-identity.js";
import { elevateRoleForAdmin, sessionToken, shouldResolveIdentity } from "./neon-auth.js";

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

describe("elevateRoleForAdmin", () => {
  test("a site admin is elevated to MAINTAINER regardless of allowlist role", () => {
    // The security-critical rule: an admin needs no reviewer_allowlist row.
    expect(elevateRoleForAdmin(Role.ANONYMOUS, true)).toBe(Role.MAINTAINER);
    expect(elevateRoleForAdmin(Role.REVIEWER, true)).toBe(Role.MAINTAINER);
    expect(elevateRoleForAdmin(Role.MAINTAINER, true)).toBe(Role.MAINTAINER);
  });

  test("a non-admin keeps their allowlist role unchanged", () => {
    expect(elevateRoleForAdmin(Role.ANONYMOUS, false)).toBe(Role.ANONYMOUS);
    expect(elevateRoleForAdmin(Role.REVIEWER, false)).toBe(Role.REVIEWER);
    expect(elevateRoleForAdmin(Role.MAINTAINER, false)).toBe(Role.MAINTAINER);
  });
});

describe("shouldResolveIdentity", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const row = (login: string | null, updatedAt: string | null): UserIdentityRow => ({
    user_id: "u",
    github_login: login,
    github_id: "1",
    name: null,
    email: null,
    avatar_url: null,
    updated_at: updatedAt ? new Date(updatedAt) : null,
  });

  test("resolves a user with no row yet", () => {
    expect(shouldResolveIdentity(null, now)).toBe(true);
  });

  test("never re-resolves a resolved login", () => {
    expect(shouldResolveIdentity(row("octocat", "2020-01-01T00:00:00Z"), now)).toBe(false);
  });

  test("waits before retrying a recent failed resolution", () => {
    expect(shouldResolveIdentity(row(null, "2026-10-24T11:55:00Z"), now)).toBe(false);
  });

  test("retries a stale unresolved row", () => {
    expect(shouldResolveIdentity(row(null, "2026-10-24T11:30:00Z"), now)).toBe(true);
    expect(shouldResolveIdentity(row(null, null), now)).toBe(true);
  });
});
