// Unit tests for content_event row mapping. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { type ContentEventRow, contentEventFromRow } from "./review-requests.js";

const USER_ID = "3f2a9c1e-0b7d-4e5f-9a1b-2c3d4e5f6a7b";

function row(over: Partial<ContentEventRow> = {}): ContentEventRow {
  return {
    id: "1",
    area: "docs",
    slug: "unitycatalog/how-to/manage-views",
    kind: "approved-by",
    actor: USER_ID,
    payload: { reviewer_user_id: USER_ID } as ContentEventRow["payload"],
    created_at: new Date("2026-10-24T00:00:00Z"),
    ...over,
  };
}

describe("contentEventFromRow", () => {
  test("carries the resolved actor and reviewer names", () => {
    const e = contentEventFromRow(row({ actor_name: "Ada", reviewer_name: "Ada" }));
    expect(e.actor).toBe(USER_ID);
    expect(e.actorName).toBe("Ada");
    expect(e.reviewerName).toBe("Ada");
  });

  test("a resolved reviewer name wins over the login stored on the event", () => {
    const e = contentEventFromRow(
      row({ payload: { reviewer_login: "old-handle" }, reviewer_name: "new-handle" }),
    );
    expect(e.reviewerName).toBe("new-handle");
    expect(e.reviewerLogin).toBe("old-handle");
  });

  test("falls back to the stored login, and leaves names absent for system actors", () => {
    const e = contentEventFromRow(
      row({ kind: "released", actor: "git", payload: { reviewer_login: "ada" } }),
    );
    expect(e.actorName).toBeUndefined();
    expect(e.reviewerName).toBe("ada");
  });
});
