import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import {
  CommentSchema,
  ContentArea,
  ContentRefSchema,
  type RecentComment,
  RecentCommentSchema,
} from "../gen/docs_factory/review/v1/messages_pb";
import { buildFeed, feedQueue } from "./comment-feed";

const ref = (slug: string) => create(ContentRefSchema, { area: ContentArea.BLOGS, slug });
const rc = (
  id: string,
  slug: string,
  extra: { parentId?: string; resolved?: boolean; unread?: boolean } = {},
): RecentComment =>
  create(RecentCommentSchema, {
    comment: create(CommentSchema, { id, parentId: extra.parentId }),
    ref: ref(slug),
    contentTitle: slug.toUpperCase(),
    resolved: extra.resolved ?? false,
    unread: extra.unread ?? false,
  });
const titleOf = (c: RecentComment) => c.contentTitle;

// Newest first, as listRecentComments returns them.
const recent = [
  rc("r2", "a", { parentId: "t1", unread: true }),
  rc("t3", "b", { unread: true }),
  rc("r1", "a", { parentId: "t1" }),
  rc("t2", "a", { resolved: true }),
  rc("t1", "a"),
];

test("collapses to one entry per thread, grouped by page in activity order", () => {
  const groups = buildFeed(recent, { showResolved: false, titleOf });
  expect(groups.map((g) => g.title)).toEqual(["A", "B"]);
  const [t1] = groups[0].threads;
  expect(t1).toMatchObject({ rootId: "t1", count: 3, unread: 1 });
  expect(t1.latest.comment?.id).toBe("r2");
  expect(feedQueue(groups).map((t) => t.rootId)).toEqual(["t1", "t3"]);
});

test("resolved threads only appear when asked for", () => {
  const groups = buildFeed(recent, { showResolved: true, titleOf });
  expect(feedQueue(groups).map((t) => t.rootId)).toEqual(["t1", "t2", "t3"]);
});
