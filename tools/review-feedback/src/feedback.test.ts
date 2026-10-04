import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { agentState, matchesState } from "./feedback.js";
import { CommentSchema, ThreadSchema } from "./gen/docs_factory/review/v1/messages_pb.js";

const comment = (id: string, viaAgent = false) => create(CommentSchema, { id, viaAgent });

describe("agentState", () => {
  test("a reviewer's thread with no agent reply is open", () => {
    expect(agentState(create(ThreadSchema, { root: comment("r") }))).toBe("open");
  });

  test("an agent reply as the newest comment hands the thread back to the reviewer", () => {
    const t = create(ThreadSchema, { root: comment("r"), replies: [comment("a", true)] });
    expect(agentState(t)).toBe("awaiting-reviewer");
  });

  test("a human reply after the agent's reopens it", () => {
    const t = create(ThreadSchema, {
      root: comment("r"),
      replies: [comment("a", true), comment("h")],
    });
    expect(agentState(t)).toBe("open");
  });

  test("resolution wins", () => {
    const t = create(ThreadSchema, {
      root: comment("r"),
      replies: [comment("a", true)],
      resolved: true,
    });
    expect(agentState(t)).toBe("resolved");
  });
});

test("matchesState filters", () => {
  expect(matchesState("open", "open")).toBe(true);
  expect(matchesState("awaiting-reviewer", "open")).toBe(false);
  expect(matchesState("awaiting-reviewer", "awaiting")).toBe(true);
  expect(matchesState("awaiting-reviewer", "unresolved")).toBe(true);
  expect(matchesState("resolved", "unresolved")).toBe(false);
  expect(matchesState("resolved", "all")).toBe(true);
});
