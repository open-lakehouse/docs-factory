// Unit tests for the allowlist role lookup. Run with `bun test`.
//
// lookupRole builds a tagged-template SQL query, so we stub the `sql` tag with a
// fake that captures the interpolated values (the login and the email array) and
// returns canned rows. That lets us assert both the matching semantics (login OR
// any email, case-insensitive; maintainer wins) and the query's shape without a
// live Postgres.
import { expect, test, describe } from "bun:test";
import { lookupRole, roleFromDb } from "./allowlist.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";
import type { Queryable } from "./db.js";

/**
 * A fake `sql` tag: records the interpolated values from the last call and
 * returns `rows`. `values[0]` is the login (or null), `values[2]` the email
 * array — matching the two `${...}` holes in lookupRole's query, after the
 * `${login ?? null}::text` guard reuses `login` twice.
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
  test("returns ANONYMOUS with neither login nor emails (no query)", async () => {
    const { tag, calls } = fakeSql([]);
    expect(await lookupRole(tag, {})).toBe(Role.ANONYMOUS);
    expect(await lookupRole(tag, { emails: [] })).toBe(Role.ANONYMOUS);
    expect(calls.length).toBe(0); // short-circuits before touching the db
  });

  test("normalizes emails: trims, lowercases, dedupes, drops blanks", async () => {
    const { tag, calls } = fakeSql([]);
    await lookupRole(tag, { emails: ["  A@X.io ", "a@x.io", "", "   ", "b@x.io"] });
    // The email array is the last interpolated value in the query.
    const emailArg = calls[0].at(-1) as string[];
    expect(emailArg).toEqual(["a@x.io", "b@x.io"]);
  });

  test("passes the login through for the github_login match", async () => {
    const { tag, calls } = fakeSql([]);
    await lookupRole(tag, { login: "roeap", emails: [] });
    expect(calls[0][0]).toBe("roeap");
  });

  test("maintainer wins over reviewer when rows disagree", async () => {
    const { tag } = fakeSql([{ role: "reviewer" }, { role: "maintainer" }]);
    expect(await lookupRole(tag, { login: "x", emails: ["y@z.io"] })).toBe(Role.MAINTAINER);
  });

  test("reviewer when that's the only match", async () => {
    const { tag } = fakeSql([{ role: "reviewer" }]);
    expect(await lookupRole(tag, { emails: ["y@z.io"] })).toBe(Role.REVIEWER);
  });

  test("ANONYMOUS when the query returns no rows", async () => {
    const { tag } = fakeSql([]);
    expect(await lookupRole(tag, { login: "nobody", emails: ["no@one.io"] })).toBe(Role.ANONYMOUS);
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
