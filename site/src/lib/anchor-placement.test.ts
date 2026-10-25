import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import {
  AnchorState,
  CommentSchema,
  SuggestionSchema,
  SuggestionState,
  TextSelectorSchema,
} from "../gen/docs_factory/review/v1/messages_pb";
import { anchorPlacement, currentSelector } from "./anchor-placement";

const root = (fields: Parameters<typeof create<typeof CommentSchema>>[1]) =>
  create(CommentSchema, {
    selector: create(TextSelectorSchema, { quote: "Mount a host folder", prefix: "so" }),
    ...fields,
  });

test("a thread where it was written has no placement", () => {
  expect(anchorPlacement(root({ anchorState: AnchorState.EXACT }))).toBeUndefined();
  expect(anchorPlacement(root({}))).toBeUndefined();
});

test("a moved thread names the heading it was written under", () => {
  const p = anchorPlacement(
    root({
      anchorState: AnchorState.MOVED,
      anchorSlug: "download",
      authoredAnchorSlug: "share",
      authoredHeading: "Share",
    }),
  );
  expect(p?.badge).toBe("Moved");
  expect(p?.detail).toContain("written under “Share”");
});

test("an applied suggestion is not drift", () => {
  const applied = create(SuggestionSchema, { state: SuggestionState.APPLIED });
  expect(
    anchorPlacement(root({ anchorState: AnchorState.SECTION, suggestion: applied })),
  ).toBeUndefined();
});

test("a reworded thread resolves the text it matches now", () => {
  const r = root({ anchorState: AnchorState.REWRITTEN, anchorCurrentQuote: "mount the folder" });
  expect(currentSelector(r)).toEqual({ quote: "mount the folder" });
  expect(currentSelector(root({ anchorState: AnchorState.MOVED }))?.prefix).toBe("so");
});

test("a reworded thread under its own heading doesn't name it", () => {
  const p = anchorPlacement(
    root({
      anchorState: AnchorState.REWRITTEN,
      anchorSlug: "share",
      authoredAnchorSlug: "share",
      authoredHeading: "Share",
    }),
  );
  expect(p?.detail).not.toContain("written under");
});
