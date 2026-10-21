import { expect, test } from "bun:test";
import type { NavNode } from "../../../doc-nav";
import { findPlannedSlot } from "./planned-slot";

const nav: NavNode[] = [
  { kind: "planned", id: "E12", title: "Coming from Databricks" },
  {
    kind: "section",
    label: "Use",
    children: [
      {
        kind: "section",
        label: "Tutorials",
        children: [{ kind: "planned", id: "T06", title: "Agent tool", request: "r-1" }],
      },
    ],
  },
];

test("finds a nested slot with its section trail and request", () => {
  expect(findPlannedSlot(nav, "T06")).toEqual({
    id: "T06",
    title: "Agent tool",
    trail: ["Use", "Tutorials"],
    request: "r-1",
  });
  expect(findPlannedSlot(nav, "E12")).toEqual({
    id: "E12",
    title: "Coming from Databricks",
    trail: [],
  });
});

test("an unknown id is null", () => {
  expect(findPlannedSlot(nav, "H99")).toBeNull();
});
