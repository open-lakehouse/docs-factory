// The md-twin target's pure hooks (emit/targets/md-twin.mjs) + the driver's pure
// helpers (site/scripts/build-md-twins.mjs). The full emitter integration is
// exercised in emit/; these cover the parts that shape twin paths, frontmatter,
// and image URLs with no I/O.
import { expect, test } from "bun:test";
import mdTwin, { frontmatter, renderImage } from "../../../../emit/targets/md-twin.mjs";
import {
  companionsFrontmatter,
  companionsSection,
  environmentFrontmatter,
  injectCanonical,
  injectFrontmatter,
  prependSection,
  runnableExamplesSection,
  scaffoldSections,
  twinPathForHref,
} from "../../../scripts/build-md-twins.mjs";

test("renderImage leaves an image at its bare filename, wrapped in a paragraph", () => {
  const node = renderImage({ filename: "screenshot.png", altText: "Shot" });
  expect(node.type).toBe("paragraph"); // block node → keeps blank-line separators
  const img = node.children[0];
  expect(img.type).toBe("image");
  expect(img.url).toBe("screenshot.png");
  expect(img.alt).toBe("Shot");
});

test("frontmatter emits title/summary/diataxis/project but never canonical", () => {
  const fm = frontmatter({
    title: "T",
    summary: "S",
    diataxis: "how-to",
    project: "delta",
    extra: "x",
  });
  expect(fm).toEqual({ title: "T", summary: "S", diataxis: "how-to", project: "delta" });
  expect(fm.canonical).toBeUndefined();
});

test("frontmatter returns null when the draft has nothing to expose", () => {
  expect(frontmatter({})).toBeNull();
});

test("the md-twin target is a flattening target (no title H1, reflows prose)", () => {
  expect(mdTwin.titleAsH1).toBe(false);
  expect(mdTwin.unwrapProse).toBe(true); // reflow authoring hard-wraps for clean twins
  expect(mdTwin.constructs.tldr).toBeDefined();
  expect(mdTwin.constructs.callouts).toBeDefined();
});

test("twinPathForHref maps a route to canonical-route + .md under dist/", () => {
  expect(twinPathForHref("/docs/delta/how-to/read")).toMatch(
    /\/dist\/docs\/delta\/how-to\/read\.md$/,
  );
  expect(twinPathForHref("/blog/my-post")).toMatch(/\/dist\/blog\/my-post\.md$/);
});

test("injectCanonical adds canonical into an existing frontmatter block", () => {
  const out = injectCanonical("---\ntitle: T\n---\n\nBody\n", "https://x.test/docs/a");
  expect(out).toContain("title: T");
  expect(out).toContain("canonical: https://x.test/docs/a");
  // canonical sits inside the frontmatter block, before its closing fence.
  expect(out.indexOf("canonical:")).toBeLessThan(out.indexOf("\n---", 4) + 4);
});

test("injectCanonical prepends a frontmatter block when the twin has none", () => {
  const out = injectCanonical("Body only\n", "https://x.test/docs/a");
  expect(out.startsWith("---\ncanonical: https://x.test/docs/a\n---\n")).toBe(true);
});

test("scaffoldSections appends Related concepts; Runnable examples only for tutorials", () => {
  const doc = scaffoldSections("Body\n", { isTutorial: false });
  expect(doc).toContain("## Related concepts");
  expect(doc).not.toContain("## Runnable examples");

  const tut = scaffoldSections("Body\n", { isTutorial: true });
  expect(tut).toContain("## Related concepts");
  expect(tut).toContain("## Runnable examples");
  expect(tut).toContain("_None yet._"); // placeholder when no examples supplied
});

test("scaffoldSections uses a supplied Runnable examples body over the placeholder", () => {
  const examples = "## Runnable examples\n\n- [`x.py`](/docs/a/tutorials/b/x.py)\n";
  const tut = scaffoldSections("Body\n", { isTutorial: true, examples });
  expect(tut).toContain("- [`x.py`](/docs/a/tutorials/b/x.py)");
  expect(tut).not.toContain("## Runnable examples\n\n_None yet._");
});

test("runnableExamplesSection lists fetch URL + PEP 723 contract; empty when no scripts", () => {
  expect(runnableExamplesSection([])).toBe("");
  const md = runnableExamplesSection([
    {
      kind: "python",
      fetchUrl: "/docs/uc/tutorials/getting-started/snippets/catalog_flow.py",
      requiresPython: ">=3.11",
      dependencies: ["unitycatalog-client>=0.5"],
      compose: "compose.yaml",
      services: ["unitycatalog"],
    },
  ]);
  expect(md).toContain("## Runnable examples");
  expect(md).toContain("the script *is* the test");
  expect(md).toContain(
    "[`catalog_flow.py`](/docs/uc/tutorials/getting-started/snippets/catalog_flow.py)",
  );
  expect(md).toContain("requires Python `>=3.11`");
  expect(md).toContain("`unitycatalog-client>=0.5`");
  expect(md).toContain("needs Docker Compose `compose.yaml`");
  expect(md).toContain("services: `unitycatalog`");
});

test("runnableExamplesSection tells readers to run a shell example with bash", () => {
  const md = runnableExamplesSection([
    {
      kind: "shell",
      fetchUrl: "/docs/uc/tutorials/getting-started/snippets/first_catalog.sh",
      requiresPython: null,
      dependencies: [],
      compose: "../compose.yaml",
      services: ["unitycatalog"],
    },
  ]);
  expect(md).toContain(
    "[`first_catalog.sh`](/docs/uc/tutorials/getting-started/snippets/first_catalog.sh)",
  );
  expect(md).toContain("run with `bash first_catalog.sh`");
  expect(md).not.toContain("uv run");
  expect(md).not.toContain("requires Python");
  expect(md).toContain("needs Docker Compose `../compose.yaml` (services: `unitycatalog`)");
});

test("runnableExamplesSection sends a SQL example to the page's shell, not a runner", () => {
  const md = runnableExamplesSection([
    {
      kind: "sql",
      fetchUrl: "/docs/delta/how-to/read-a-delta-table/snippets/read_spark.sql",
      requiresPython: null,
      dependencies: [],
      compose: null,
      services: [],
    },
  ]);
  expect(md).toContain("enter its statements in the SQL shell the page opens");
  expect(md).not.toContain("uv run");
  expect(md).not.toContain("bash ");
});

test("companions list a SQL file without a run command", () => {
  const sql = {
    kind: "sql",
    fetchUrl: "/docs/delta/how-to/read/snippets/read_duckdb.sql",
    summary: "Read the orders table with DuckDB.",
    requiresPython: null,
    services: [],
    env: {},
  };
  const yaml = companionsFrontmatter([sql], "https://x.test");
  expect(yaml).toContain("    kind: sql");
  expect(yaml).not.toContain("    run:");
  const md = companionsSection([sql], "https://x.test");
  expect(md).toContain("(SQL): Read the orders table with DuckDB.");
  expect(md).toContain("  - run: enter its statements in the SQL shell the page opens");
});

test("Scala and Java companions run with scala-cli and JBang", () => {
  const script = (kind, file) => ({
    kind,
    fetchUrl: `/how-to/read/snippets/${file}`,
    summary: "Read a Delta table.",
    requiresPython: null,
    services: [],
    env: {},
  });
  const md = companionsSection([script("scala", "read.sc"), script("java", "Read.java")]);
  expect(md).toContain("(Scala): Read a Delta table.");
  expect(md).toContain("  - run: `scala-cli run read.sc`");
  expect(md).toContain("(Java): Read a Delta table.");
  expect(md).toContain("  - run: `jbang Read.java`");
  expect(runnableExamplesSection([script("java", "Read.java")])).toContain(
    "run with `jbang Read.java`",
  );
});

test("a Rust companion is a Cargo project's main.rs, set up with cargo add", () => {
  const rust = {
    kind: "rust",
    fetchUrl: "/how-to/read/snippets/read.rs",
    summary: "Read a Delta table.",
    dependencies: ["deltalake@1.1.1 --features datafusion", "tokio@1 --features macros"],
    requiresPython: null,
    services: [],
    env: {},
  };
  const run =
    "cargo add deltalake@1.1.1 --features datafusion && cargo add tokio@1 --features macros && cargo run";
  const md = companionsSection([rust]);
  expect(md).toContain("(Rust): Read a Delta table.");
  expect(md).toContain(`  - run: \`${run}\`, in a new Cargo project with it as \`src/main.rs\``);
  expect(runnableExamplesSection([rust])).toContain(`\`${run}\``);
});

const COMPANIONS = [
  {
    kind: "python",
    fetchUrl: "/how-to/aws/snippets/aws_storage.py",
    summary: "Register an S3 credential.",
    requiresPython: ">=3.11",
    services: ["unitycatalog"],
    env: { AWS_ENDPOINT_URL: "http://localhost:9000" },
  },
  {
    kind: "shell",
    fetchUrl: "/how-to/aws/snippets/aws_storage.sh",
    summary: null,
    requiresPython: null,
    services: ["unitycatalog"],
    env: { AWS_ENDPOINT_URL: "http://localhost:9000" },
  },
];

const ENVIRONMENT = {
  title: "Unity Catalog 0.6.0 with simulated S3",
  dir: "uc-docs-env/unitycatalog",
  commands: [
    "curl -fsSL https://x.test/env/uc-docs-env.tar.gz | tar -xz",
    "cd uc-docs-env/unitycatalog",
    "docker compose -f compose.aws.yaml up -d --wait",
  ],
  stop: "docker compose -f compose.aws.yaml down",
};

test("companionsFrontmatter lists each script with an absolute URL and run command", () => {
  expect(companionsFrontmatter([], "https://x.test")).toBe("");
  const yaml = companionsFrontmatter(COMPANIONS, "https://x.test");
  expect(yaml).toContain('  - url: "https://x.test/how-to/aws/snippets/aws_storage.py"');
  expect(yaml).toContain('    purpose: "Register an S3 credential."');
  expect(yaml).toContain(
    '    run: "AWS_ENDPOINT_URL=http://localhost:9000 uv run https://x.test/how-to/aws/snippets/aws_storage.py"',
  );
  expect(yaml).toContain('    run: "bash aws_storage.sh"');
  expect(yaml).toContain('    services: ["unitycatalog"]');
});

test("environmentFrontmatter carries the exact start and stop commands", () => {
  expect(environmentFrontmatter(null)).toBe("");
  const yaml = environmentFrontmatter(ENVIRONMENT, "https://x.test/env/environments.json");
  expect(yaml).toStartWith('environment:\n  title: "Unity Catalog 0.6.0 with simulated S3"');
  expect(yaml).toContain('"docker compose -f compose.aws.yaml up -d --wait"]');
  expect(yaml).toContain('  stop: "docker compose -f compose.aws.yaml down"');
  expect(yaml).toContain('  index: "https://x.test/env/environments.json"');
  expect(yaml).not.toContain("elements:");
  expect(environmentFrontmatter(ENVIRONMENT, null, ["unityCatalogServer", "rustfs"])).toContain(
    '  elements: ["unityCatalogServer", "rustfs"]',
  );
});

test("companionsSection gives link, purpose, run command, and the stack", () => {
  expect(companionsSection([])).toBe("");
  const md = companionsSection(COMPANIONS, "https://x.test", ENVIRONMENT);
  expect(md).toStartWith("## Companion files\n");
  expect(md).toContain(
    "- [`aws_storage.py`](https://x.test/how-to/aws/snippets/aws_storage.py) (Python): Register an S3 credential.",
  );
  expect(md).toContain(
    "- [`aws_storage.sh`](https://x.test/how-to/aws/snippets/aws_storage.sh) (Shell)\n",
  );
  expect(md).toContain("run: `bash aws_storage.sh` from `uc-docs-env/unitycatalog`");
  expect(md).toContain("They need Unity Catalog 0.6.0 with simulated S3 running");
  expect(md).toContain(`\`\`\`bash\n${ENVIRONMENT.commands.join("\n")}\n\`\`\``);
  expect(md).not.toContain("compose.yaml`");
});

test("a script that imports a helper runs from its folder, with the helper beside it", () => {
  const s = {
    kind: "python",
    fetchUrl: "/how-to/df/snippets/pandas_tables.py",
    summary: null,
    env: {},
    helpers: [{ fetchUrl: "/how-to/df/snippets/_seed.py" }],
  };
  const yaml = companionsFrontmatter([s], "https://x.test");
  expect(yaml).toContain('    run: "uv run pandas_tables.py"');
  expect(yaml).toContain('    helpers: ["https://x.test/how-to/df/snippets/_seed.py"]');
  expect(companionsSection([s], "https://x.test")).toContain(
    "  - save [`_seed.py`](https://x.test/how-to/df/snippets/_seed.py) beside it first",
  );
});

test("injectFrontmatter + prependSection put companions ahead of the body", () => {
  const twin = "---\ntitle: T\n---\n\nBody\n";
  const out = prependSection(injectFrontmatter(twin, "companions: []"), "## Companion files\n");
  expect(out).toBe("---\ntitle: T\ncompanions: []\n---\n\n## Companion files\n\nBody\n");
  expect(prependSection("Body\n", "## S\n")).toBe("## S\n\nBody\n");
});
