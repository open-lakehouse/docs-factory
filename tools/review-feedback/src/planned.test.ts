import { expect, test } from "bun:test";
import { plannedSlotRef, scanPlanned } from "./planned.js";

const nav = `nav:
  - section: Start here
    items:
      - page: tutorials/getting-started
        id: T01
      - planned: E12
        title: Coming from Databricks Unity Catalog
      - planned: "T06"   # agent tools
        title: 'Build an agent tool'
        request: 0190a4b2-0000-7000-8000-000000000000
`;

test("scans each planned entry with its title and line", () => {
  expect(scanPlanned("unitycatalog", "content/unitycatalog/nav.yml", nav)).toEqual([
    {
      project: "unitycatalog",
      id: "E12",
      title: "Coming from Databricks Unity Catalog",
      path: "content/unitycatalog/nav.yml",
      line: 6,
    },
    {
      project: "unitycatalog",
      id: "T06",
      title: "Build an agent tool",
      path: "content/unitycatalog/nav.yml",
      line: 8,
    },
  ]);
});

test("a slot's ref is the synthetic planned identity", () => {
  const ref = plannedSlotRef({ project: "unitycatalog", id: "T06" });
  expect(ref.bucket).toBe("planned");
  expect(ref.slug).toBe("planned/unitycatalog/T06");
  expect(ref.project).toBe("unitycatalog");
});
