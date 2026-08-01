// Unit tests for the allowlist role lookup. Run with `bun test`.
//
// lookupRole builds a tagged-template SQL query keyed on the stable user id, so
// we stub the `sql` tag with a fake that captures the interpolated value (the
// user id) and returns canned rows. That lets us assert the query is an exact
// user_id match and the role mapping, without a live Postgres.
import { expect, test, describe } from "bun:test";
import {
  lookupRole,
  roleFromDb,
  hasAdminRole,
  grantFromRequestRows,
  hasContentGrant,
  hasAnyContentGrant,
} from "./allowlist.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";
import type { Queryable } from "./db.js";

/**
 * A fake `sql` tag: records the interpolated values from the last call and
 * returns `rows`. The query has one `${userId}` hole — `values[0]`.
 */
function fakeSql(rows: { role: string }[]) {
  const calls: unknown[][] = [];
  const tag = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return Promise.resolve(rows);
  }) as unknown as Queryable;
  return { tag, calls };
}

describe("lookupRole", () => {
  test("returns ANONYMOUS with no user id (no query)", async () => {
    const { tag, calls } = fakeSql([]);
    expect(await lookupRole(tag, {})).toBe(Role.ANONYMOUS);
    expect(await lookupRole(tag, { userId: null })).toBe(Role.ANONYMOUS);
    expect(await lookupRole(tag, { userId: "  " })).toBe(Role.ANONYMOUS);
    expect(calls.length).toBe(0); // short-circuits before touching the db
  });

  test("queries by the trimmed user id", async () => {
    const { tag, calls } = fakeSql([{ role: "reviewer" }]);
    await lookupRole(tag, { userId: "  user-abc  " });
    expect(calls[0][0]).toBe("user-abc");
  });

  test("maps a maintainer row to MAINTAINER", async () => {
    const { tag } = fakeSql([{ role: "maintainer" }]);
    expect(await lookupRole(tag, { userId: "user-abc" })).toBe(Role.MAINTAINER);
  });

  test("maps a reviewer row to REVIEWER", async () => {
    const { tag } = fakeSql([{ role: "reviewer" }]);
    expect(await lookupRole(tag, { userId: "user-abc" })).toBe(Role.REVIEWER);
  });

  test("ANONYMOUS when the query returns no rows (not on the allowlist)", async () => {
    const { tag } = fakeSql([]);
    expect(await lookupRole(tag, { userId: "nobody" })).toBe(Role.ANONYMOUS);
  });
});

describe("roleFromDb", () => {
  test("maps the text column to the proto Role", () => {
    expect(roleFromDb("maintainer")).toBe(Role.MAINTAINER);
    expect(roleFromDb("reviewer")).toBe(Role.REVIEWER);
    expect(roleFromDb("something-else")).toBe(Role.ANONYMOUS);
    expect(roleFromDb(null)).toBe(Role.ANONYMOUS);
  });
});

describe("hasAdminRole", () => {
  test("true for the bare admin role", () => {
    expect(hasAdminRole("admin")).toBe(true);
    expect(hasAdminRole(" Admin ")).toBe(true); // trimmed + case-insensitive
  });

  test("true when admin is one of several comma-separated roles", () => {
    expect(hasAdminRole("user,admin")).toBe(true);
    expect(hasAdminRole("admin,superuser")).toBe(true);
    expect(hasAdminRole("user, admin , editor")).toBe(true);
  });

  test("false when admin is absent", () => {
    expect(hasAdminRole("user")).toBe(false);
    expect(hasAdminRole("user,editor")).toBe(false);
  });

  test("membership, not substring: administrator does NOT match", () => {
    expect(hasAdminRole("administrator")).toBe(false);
    expect(hasAdminRole("user,administrator")).toBe(false);
  });

  test("false for null/undefined/empty (plugin not enabled → no role column)", () => {
    expect(hasAdminRole(null)).toBe(false);
    expect(hasAdminRole(undefined)).toBe(false);
    expect(hasAdminRole("")).toBe(false);
  });
});

describe("grantFromRequestRows", () => {
  test("an allowlisted viewer always has access, regardless of rows", () => {
    expect(grantFromRequestRows({ isAllowlisted: true }, [])).toBe(true);
    expect(
      grantFromRequestRows({ isAllowlisted: true, userId: null }, [{ status: "cancelled" }]),
    ).toBe(true);
  });

  test("external with an OPEN request has access", () => {
    expect(
      grantFromRequestRows({ isAllowlisted: false, userId: "u1" }, [{ status: "open" }]),
    ).toBe(true);
  });

  test("external RETAINS access after approving (request satisfied, not cancelled)", () => {
    expect(
      grantFromRequestRows({ isAllowlisted: false, userId: "u1" }, [{ status: "satisfied" }]),
    ).toBe(true);
  });

  test("external with only a cancelled request has NO access", () => {
    expect(
      grantFromRequestRows({ isAllowlisted: false, userId: "u1" }, [{ status: "cancelled" }]),
    ).toBe(false);
  });

  test("external with no request rows has no access", () => {
    expect(grantFromRequestRows({ isAllowlisted: false, userId: "u1" }, [])).toBe(false);
  });

  test("an id-less (anonymous) viewer never has a grant", () => {
    expect(grantFromRequestRows({ isAllowlisted: false }, [{ status: "open" }])).toBe(false);
    expect(
      grantFromRequestRows({ isAllowlisted: false, userId: "  " }, [{ status: "open" }]),
    ).toBe(false);
  });
});

/** A fake `sql` tag returning `rows`, recording the interpolated hole values. */
function fakeGrantSql(rows: { status: string }[]) {
  const calls: unknown[][] = [];
  const tag = ((_s: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return Promise.resolve(rows);
  }) as unknown as Queryable;
  return { tag, calls };
}

describe("hasContentGrant", () => {
  test("allowlisted viewer short-circuits — no query", async () => {
    const { tag, calls } = fakeGrantSql([]);
    expect(await hasContentGrant(tag, { isAllowlisted: true }, "blogs", "x")).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("id-less non-allowlisted viewer short-circuits to false", async () => {
    const { tag, calls } = fakeGrantSql([{ status: "open" }]);
    expect(await hasContentGrant(tag, { isAllowlisted: false }, "blogs", "x")).toBe(false);
    expect(calls.length).toBe(0);
  });

  test("external with a matching non-cancelled request is granted", async () => {
    const { tag, calls } = fakeGrantSql([{ status: "satisfied" }]);
    expect(
      await hasContentGrant(tag, { isAllowlisted: false, userId: "u1" }, "blogs", "x"),
    ).toBe(true);
    // area, slug, user id are interpolated into the query.
    expect(calls[0]).toContain("blogs");
    expect(calls[0]).toContain("x");
    expect(calls[0]).toContain("u1");
  });

  test("external with no matching request is denied", async () => {
    const { tag } = fakeGrantSql([]);
    expect(
      await hasContentGrant(tag, { isAllowlisted: false, userId: "u1" }, "blogs", "x"),
    ).toBe(false);
  });
});

describe("hasAnyContentGrant", () => {
  test("false for an empty/whitespace user id (no query)", async () => {
    const { tag, calls } = fakeGrantSql([{ status: "open" }]);
    expect(await hasAnyContentGrant(tag, null)).toBe(false);
    expect(await hasAnyContentGrant(tag, "  ")).toBe(false);
    expect(calls.length).toBe(0);
  });

  test("true when any non-cancelled request names the user", async () => {
    const { tag } = fakeGrantSql([{ status: "open" }]);
    expect(await hasAnyContentGrant(tag, "u1")).toBe(true);
  });

  test("false when no request names the user", async () => {
    const { tag } = fakeGrantSql([]);
    expect(await hasAnyContentGrant(tag, "u1")).toBe(false);
  });
});
