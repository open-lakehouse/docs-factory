import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import {
  ContentArea,
  ContentRequestKind,
  ContentRequestSchema,
  ContentRequestStatus,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { filterRequests, parseFilters, requestTargetHref } from "./requests";

const req = (init: Parameters<typeof create<typeof ContentRequestSchema>>[1]) =>
  create(ContentRequestSchema, init);

const page = req({
  id: "a",
  area: ContentArea.DOCS,
  project: "delta",
  placement: "Start here › Engines",
  status: ContentRequestStatus.OPEN,
});
const journey = req({
  id: "b",
  area: ContentArea.DOCS,
  project: "unitycatalog",
  placement: "tables",
  kind: ContentRequestKind.JOURNEY,
  status: ContentRequestStatus.ACCEPTED,
});
const blog = req({
  id: "c",
  area: ContentArea.BLOGS,
  placement: "Blog",
  status: ContentRequestStatus.DECLINED,
});
const all = [page, journey, blog];
const ids = (rs: typeof all) => rs.map((r) => r.id);

test("defaults keep what still needs someone", () => {
  const f = parseFilters(new URLSearchParams());
  expect(f).toEqual({ status: "active", kind: "all", where: "all" });
  expect(ids(filterRequests(all, f))).toEqual(["a", "b"]);
});

test("unknown filter values fall back to the defaults", () => {
  expect(parseFilters(new URLSearchParams("status=bogus&kind=x"))).toEqual({
    status: "active",
    kind: "all",
    where: "all",
  });
});

test("status, kind, and project filters combine", () => {
  const f = (q: string) => ids(filterRequests(all, parseFilters(new URLSearchParams(q))));
  expect(f("status=all&kind=journey")).toEqual(["b"]);
  expect(f("status=all&kind=page")).toEqual(["a", "c"]);
  expect(f("status=all&project=blogs")).toEqual(["c"]);
  expect(f("status=declined")).toEqual(["c"]);
  expect(f("project=delta")).toEqual(["a"]);
});

test("each request links to where it would be planned", () => {
  expect(requestTargetHref(page)).toBe("/plan/roadmap?project=delta#section-start-here-engines");
  expect(requestTargetHref(journey)).toBe("/plan/compat?project=unitycatalog");
  expect(requestTargetHref(blog)).toBe("/plan/pipeline");
});
