// engineReport: an engine's journeys counted and linked for one consumer.
import { expect, test } from "bun:test";
import { engineReport } from "../coverage.mjs";

const page = (slug) => ({ project: "proj", bucket: "how-to", slug });
const proof = (slug, { ready = true, works = true } = {}) => ({
  script: `content/proj/how-to/${slug}/snippets/x.py`,
  page: page(slug),
  anchor: "read-it",
  ready,
  works,
  fails: null,
  version: "4.1.0",
  api: "SELECT",
  note: null,
});

const matrix = {
  interfaces: [
    { key: "sql", label: "Spark · SQL", version: "4.1.0" },
    { key: "py", label: "Spark · Python", version: "4.1.0" },
  ],
  tables: [
    {
      id: "ops",
      title: "Operations",
      columns: ["sql", "py"],
      rows: ["read", "write", "drop", "merge"],
    },
  ],
  journeys: [
    {
      id: "read",
      title: "Read",
      summary: "",
      cells: { py: { status: "tested", draft: false, proofs: [proof("read")], evidence: [] } },
    },
    {
      id: "write",
      title: "Write",
      summary: "",
      cells: {
        sql: {
          status: "tested",
          draft: true,
          proofs: [proof("write", { ready: false })],
          evidence: [],
        },
      },
    },
    {
      id: "drop",
      title: "Drop",
      summary: "",
      cells: {
        sql: {
          status: "fails",
          draft: false,
          proofs: [],
          evidence: [
            {
              outcome: "fails",
              page: null,
              why: "No API",
              source: "https://example.com/issue",
              api: null,
            },
          ],
        },
      },
    },
    { id: "merge", title: "Merge", summary: "", cells: {} },
  ],
};
const engine = {
  id: "apacheSpark",
  title: "Apache Spark",
  interfaces: ["sql", "py"],
  page: { project: "proj", bucket: "reference", slug: "spark" },
  groups: [{ table: "ops", columns: ["sql", "py"], rows: ["read", "write", "drop", "merge"] }],
};
const published = new Set(["reference/spark", "how-to/read"]);
const options = {
  href: (p, anchor) =>
    published.has(`${p.bucket}/${p.slug}`)
      ? `/${p.bucket}/${p.slug}${anchor ? `#${anchor}` : ""}`
      : null,
  scriptUrl: (path) => `/${path.split("/").slice(2).join("/")}`,
  drafts: false,
};

test("a journey takes its best interface, and unpublished drafts don't count", () => {
  const report = engineReport(matrix, engine, options);
  expect(report.href).toBe("/reference/spark");
  expect(report.counts).toEqual({ proven: 1, draft: 0, documented: 0, no: 1, unknown: 2 });
  const [group] = report.groups;
  expect(group.title).toBe("Operations");
  expect(group.journeys.map((j) => j.bucket)).toEqual(["proven", "unknown", "no", "unknown"]);
  const read = group.journeys[0].variants.find((v) => v.key === "py");
  expect(read.proofs).toEqual([
    {
      href: "/how-to/read#read-it",
      script: "/how-to/read/snippets/x.py",
      api: "SELECT",
      note: null,
      fails: null,
      version: "4.1.0",
      draft: false,
    },
  ]);
  expect(group.columns.map((c) => [c.key, c.counts.proven, c.counts.no])).toEqual([
    ["sql", 0, 1],
    ["py", 1, 0],
  ]);
  expect(group.journeys[2].variants[0].evidence[0].href).toBe("https://example.com/issue");
});

test("with drafts, a draft claim counts as draft", () => {
  const report = engineReport(matrix, engine, { ...options, drafts: true });
  expect(report.groups[0].journeys[1].bucket).toBe("draft");
  expect(report.groups[0].journeys[1].variants[0].proofs[0]).toMatchObject({
    href: null,
    draft: true,
  });
});
