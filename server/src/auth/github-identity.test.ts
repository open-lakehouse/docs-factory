// Unit tests for persistUserIdentity — the login-time resolution + upsert that
// replaced the read-path GitHub API fallback. The key invariant under test: the
// numeric account id is stored in github_id and is NEVER masqueraded as a
// github_login (a failed /user resolution leaves github_login null). Run with
// `bun test`.
import { afterEach, describe, expect, test } from "bun:test";
import type { Queryable } from "../db.js";
import { fetchGithubLoginById, persistUserIdentity } from "./github-identity.js";

/** A fake `sql` tag that records interpolated values and returns []. */
function fakeSql() {
  const calls: unknown[][] = [];
  const tag = ((_s: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return Promise.resolve([]);
  }) as unknown as Queryable;
  return { tag, calls };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("persistUserIdentity", () => {
  test("resolves the GitHub @handle and stores it (login + numeric id split)", async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith("/user")) {
        return new Response(JSON.stringify({ login: "octocat" }), { status: 200 });
      }
      return new Response("[]", { status: 200 }); // /user/emails
    }) as typeof fetch;
    const { tag } = fakeSql();
    const row = await persistUserIdentity(tag, {
      userId: "u-1",
      accountId: "42610831",
      accessToken: "tok",
      jwtEmail: "o@x.io",
      userRowEmail: null,
      name: "Octo Cat",
    });
    expect(row.github_login).toBe("octocat");
    expect(row.github_id).toBe("42610831");
    expect(row.avatar_url).toBe("https://github.com/octocat.png");
  });

  test("a failed /user resolution leaves github_login null (numeric id NOT a login)", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const { tag } = fakeSql();
    const row = await persistUserIdentity(tag, {
      userId: "u-2",
      accountId: "99999",
      accessToken: "revoked",
      jwtEmail: "j@x.io",
      userRowEmail: null,
      name: null,
    });
    expect(row.github_login).toBeNull();
    expect(row.github_id).toBe("99999");
    expect(row.avatar_url).toBeNull();
    // The JWT email is still attributed to the identity for display.
    expect(row.email).toBe("j@x.io");
  });

  test("prefers a verified GitHub email, then user-row, then JWT email", async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith("/user")) {
        return new Response(JSON.stringify({ login: "dev" }), { status: 200 });
      }
      return new Response(JSON.stringify([{ email: "verified@x.io", verified: true }]), {
        status: 200,
      });
    }) as typeof fetch;
    const { tag } = fakeSql();
    const row = await persistUserIdentity(tag, {
      userId: "u-3",
      accountId: "1",
      accessToken: "tok",
      jwtEmail: "jwt@x.io",
      userRowEmail: "row@x.io",
      name: null,
    });
    expect(row.email).toBe("verified@x.io");
  });

  test("never throws when the DB write fails (returns the in-memory row)", async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith("/user")) {
        return new Response(JSON.stringify({ login: "dev" }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    const throwingTag = (() => {
      throw new Error("db down");
    }) as unknown as Queryable;
    const row = await persistUserIdentity(throwingTag, {
      userId: "u-4",
      accountId: null,
      accessToken: "tok",
      jwtEmail: null,
      userRowEmail: null,
      name: "Dev",
    });
    expect(row.github_login).toBe("dev");
  });

  test("resolves the handle from the numeric account id when there is no token", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));
      if (String(url).endsWith("/user/42610831")) {
        return new Response(JSON.stringify({ login: "octocat" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const { tag } = fakeSql();
    const row = await persistUserIdentity(tag, {
      userId: "u-5",
      accountId: "42610831",
      accessToken: null,
      jwtEmail: "o@x.io",
      userRowEmail: null,
      name: null,
    });
    expect(row.github_login).toBe("octocat");
    expect(row.avatar_url).toBe("https://github.com/octocat.png");
    expect(seen).toEqual(["https://api.github.com/user/42610831"]);
  });

  test("falls back to the account id when the stored token is rejected", async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith("/user/7")) {
        return new Response(JSON.stringify({ login: "seven" }), { status: 200 });
      }
      return new Response("bad credentials", { status: 401 });
    }) as typeof fetch;
    const { tag } = fakeSql();
    const row = await persistUserIdentity(tag, {
      userId: "u-6",
      accountId: "7",
      accessToken: "encrypted-or-stale",
      jwtEmail: null,
      userRowEmail: "row@x.io",
      name: null,
    });
    expect(row.github_login).toBe("seven");
    expect(row.email).toBe("row@x.io");
  });

  test("releases the handle from any other row before the upsert", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ login: "octocat" }), {
        status: 200,
      })) as unknown as typeof fetch;
    const { tag, calls } = fakeSql();
    await persistUserIdentity(tag, {
      userId: "u-8",
      accountId: "1",
      accessToken: null,
      jwtEmail: null,
      userRowEmail: null,
      name: null,
    });
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual(["octocat", "u-8"]);
  });
});

describe("fetchGithubLoginById", () => {
  test("never calls GitHub for a missing or non-numeric id", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchGithubLoginById(null)).toBeNull();
    expect(await fetchGithubLoginById("octocat")).toBeNull();
    expect(await fetchGithubLoginById("1/../../orgs")).toBeNull();
    expect(called).toBe(false);
  });
});
