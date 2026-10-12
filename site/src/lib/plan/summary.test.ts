import { expect, test } from "bun:test";
import { summarizePipeline } from "./summary";

const now = new Date("2026-10-12T09:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("tallies date flags and lists the next unreleased targets", () => {
  const s = summarizePipeline(
    [
      { title: "late", target: day("2026-10-01"), released: false },
      { title: "shipped", target: day("2026-09-01"), released: true },
      { title: "far", target: day("2027-01-01"), released: false },
      { title: "soon", target: day("2026-10-20"), released: false },
      { title: "someday", released: false },
    ],
    now,
    2,
  );
  expect(s.flags).toEqual({ released: 1, overdue: 1, soon: 1, scheduled: 1, unscheduled: 1 });
  expect(s.next.map((p) => p.title)).toEqual(["late", "soon"]);
});
