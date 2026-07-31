// Unit tests for the allowlist role lookup. Run with `bun test`.
//
// lookupRole builds a tagged-template SQL query keyed on the stable user id, so
// we stub the `sql` tag with a fake that captures the interpolated value (the
// user id) and returns canned rows. That lets us assert the query is an exact
// user_id match and the role mapping, without a live Postgres.
import { expect, test, describe } from "bun:test";
import { lookupRole, roleFromDb } from "./allowlist.js";
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
