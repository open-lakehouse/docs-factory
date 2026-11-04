// Rich constructs on the blog targets: Trestle and LikeC4 diagrams as the sites'
// web-component wrappers, and openlakehouse.io's own JSX for callouts, journeys,
// and images.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOne } from "../emit.mjs";
import { renderLikeC4Mdx } from "../plugins/remark-likec4-mdx.mjs";
import { trestleFiles } from "../plugins/remark-trestle-md.mjs";
import delta from "../targets/delta.mjs";
import openlakehouse, { category, SITE_COMPONENTS } from "../targets/openlakehouse.mjs";
import unitycatalog from "../targets/unitycatalog.mjs";

const dir = mkdtempSync(join(tmpdir(), "blog-rich-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ALT = "A gateway routes the Unity Catalog API to the server.";
const SNAPSHOT = "/trestle/p/uc-mlflow/diagram.trestle-graph.json";

async function emit(target, body, name = "index.md", context = {}) {
  const inputPath = join(dir, name);
  writeFileSync(
    inputPath,
    `---\ntitle: T\nauthor: A Person\nsummary: S\ntags: [agents, unity-catalog]\n---\n\n${body}`,
  );
  return emitOne({
    inputPath,
    target,
    likec4OutDir: join(dir, ".likec4-export"),
    trestleUrlBase: "/trestle/p",
    frontmatterContext: context,
  });
}

const trestleBlock = `Before.\n\n\`\`\`trestle uc-mlflow\n${ALT}\n\`\`\`\n\nAfter.\n`;

test("the Astro targets draw a Trestle diagram in TrestleView, not Mermaid", async () => {
  for (const target of [unitycatalog, delta]) {
    const { output, trestle } = await emit(target, trestleBlock);
    expect(output).toContain('import TrestleView from "@/components/blog/TrestleView.astro";');
    expect(output).toContain(`<TrestleView src="${SNAPSHOT}" alt="${ALT}" />`);
    expect(output).not.toContain("```mermaid");
    expect(trestle.map((d) => d.url)).toEqual([SNAPSHOT]);
  }
});

test("openlakehouse.io gets TrestleView with no import", async () => {
  const { output } = await emit(openlakehouse, trestleBlock);
  expect(output).toContain(`<TrestleView src="${SNAPSHOT}" alt="${ALT}" />`);
  expect(output).not.toContain("import TrestleView");
});

test("a diagram ships its snapshot and the files its manifest lists", async () => {
  const { trestle } = await emit(unitycatalog, trestleBlock);
  const files = trestleFiles(trestle[0], SNAPSHOT);
  expect(files[0]).toEqual({ url: SNAPSHOT, path: trestle[0].snapshot });
  expect(files.map((f) => f.url)).toContain("/trestle/p/uc-mlflow/compose.yaml");
});

test("a LikeC4 view keeps its alt text", () => {
  const node = renderLikeC4Mdx({ viewId: "v", alt: ALT });
  expect(node.attributes.map((a) => [a.name, a.value])).toEqual([
    ["viewId", "v"],
    ["alt", ALT],
  ]);
});

test("openlakehouse.io callouts and journeys become the site's components", async () => {
  const { output } = await emit(
    openlakehouse,
    [
      ":::tldr\nShort.\n:::",
      ":::warning[Careful]\nThis.\n:::",
      ":::tip\nThat.\n:::",
      "::::journey\n### One\nFirst.\n\n:::note\nInside.\n:::\n\n### Two\nSecond.\n::::",
      "",
    ].join("\n\n"),
  );
  expect(output).toContain('<Callout type="info" title="TL;DR">');
  expect(output).toContain('<Callout type="warn" title="Careful">');
  expect(output).toContain('<Callout type="tip">');
  expect(output).toContain('<Step title="One">');
  expect(output).not.toContain(":::");
  expect(output).not.toMatch(/^import /m);
  const names = [...output.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]);
  for (const name of names) expect(SITE_COMPONENTS).toContain(name);
});

test("openlakehouse.io imports a post's images", async () => {
  writeFileSync(join(dir, "flow.svg"), "<svg/>");
  const { output, manifest } = await emit(openlakehouse, "![The flow](./flow.svg)\n");
  expect(output).toContain('import img0 from "./flow.svg";');
  expect(output).toContain('<Figure src={img0} alt="The flow" />');
  expect(manifest.map((m) => m.filename)).toEqual(["flow.svg"]);
});

test("openlakehouse.io refuses a directive it can't render", async () => {
  await expect(emit(openlakehouse, ":::prerequisites\n- Docker\n:::\n")).rejects.toThrow(
    /can't render :::prerequisites/,
  );
});

test("openlakehouse.io frontmatter, category, and URL", () => {
  const draft = { title: "T", author: "A Person", summary: "S", tags: ["governance", "agents"] };
  expect(openlakehouse.frontmatter(draft)).toMatchObject({
    title: "T",
    authors: ["a-person"],
    excerpt: "S",
    include: ["blog"],
    kind: "post",
  });
  const cross = openlakehouse.frontmatter(draft, {
    canonical: "https://www.unitycatalog.io/blogs/2026-11-04-p/",
  });
  expect(cross.originalUrl).toBe("https://www.unitycatalog.io/blogs/2026-11-04-p/");
  expect(cross.originalPublisher).toBe("Unity Catalog");
  expect(category(draft.tags)).toBe("agentic");
  expect(category(["rust"])).toBe("lakehouse");
  expect(openlakehouse.postUrl("agentic/p")).toBe("https://openlakehouse.io/blog/agentic/p");
});

test("an openlakehouse.io cross-post credits where it was first published", async () => {
  const canonical = "https://www.unitycatalog.io/blogs/2026-11-04-p/";
  const { output } = await emit(openlakehouse, "Body.\n", "index.md", { canonical });
  expect(output).toContain(
    `*This post was originally published on the [Unity Catalog blog](${canonical}) by A Person.*`,
  );
  const { output: primary } = await emit(openlakehouse, "Body.\n");
  expect(primary).not.toContain("originally published");
});
