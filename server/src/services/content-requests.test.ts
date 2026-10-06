// Content-request validation and lifecycle (pure; no DB).
import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { ContentArea, ContentRequestStatus } from "../gen/docs_factory/review/v1/messages_pb.js";
import {
  CreateContentRequestRequestSchema,
  UpdateContentRequestRequestSchema,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import { contentRequestError, contentRequestUpdateError } from "./content-requests.js";

const docs = (over = {}) =>
  create(CreateContentRequestRequestSchema, {
    area: ContentArea.DOCS,
    project: "unitycatalog",
    placement: "Govern data",
    diataxis: "how-to",
    title: "Grant access with row filters",
    ...over,
  });

const update = (status: ContentRequestStatus, over = {}) =>
  create(UpdateContentRequestRequestSchema, { id: "x", status, ...over });

describe("contentRequestError", () => {
  test("a docs request needs a project, placement, title, and quadrant", () => {
    expect(contentRequestError(docs())).toBeNull();
    expect(contentRequestError(docs({ project: "" }))).toBe("project is required for docs");
    expect(contentRequestError(docs({ placement: " " }))).toBe("placement is required");
    expect(contentRequestError(docs({ title: "" }))).toMatch(/^title must be/);
    expect(contentRequestError(docs({ diataxis: "guide" }))).toMatch(/^diataxis must be/);
  });

  test("a blog request carries no quadrant", () => {
    const blog = { area: ContentArea.BLOGS, project: undefined, placement: "delta" };
    expect(contentRequestError(docs({ ...blog, diataxis: "" }))).toBeNull();
    expect(contentRequestError(docs(blog))).toBe("blog requests carry no diataxis");
  });
});

describe("contentRequestUpdateError", () => {
  test("open requests are accepted, declined, or done", () => {
    expect(contentRequestUpdateError("open", update(ContentRequestStatus.ACCEPTED))).toBeNull();
    expect(contentRequestUpdateError("open", update(ContentRequestStatus.DECLINED))).toBeNull();
  });

  test("done needs the planned slot's backlog id", () => {
    expect(contentRequestUpdateError("accepted", update(ContentRequestStatus.DONE))).toMatch(
      /planned_id is required/,
    );
    expect(
      contentRequestUpdateError(
        "accepted",
        update(ContentRequestStatus.DONE, {
          plannedId: "H31",
          prUrl: "https://github.com/o/r/pull/1",
        }),
      ),
    ).toBeNull();
  });

  test("done is terminal and declined only reopens", () => {
    expect(contentRequestUpdateError("done", update(ContentRequestStatus.OPEN))).toBe(
      "illegal transition done -> open",
    );
    expect(contentRequestUpdateError("declined", update(ContentRequestStatus.ACCEPTED))).toBe(
      "illegal transition declined -> accepted",
    );
    expect(contentRequestUpdateError("declined", update(ContentRequestStatus.OPEN))).toBeNull();
  });

  test("pr_url must be https", () => {
    expect(
      contentRequestUpdateError(
        "accepted",
        update(ContentRequestStatus.DONE, { plannedId: "H31", prUrl: "javascript:alert(1)" }),
      ),
    ).toBe("pr_url must be an https URL");
  });
});
