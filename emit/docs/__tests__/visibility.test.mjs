// Negative fixtures for the public projection: an internal element, a draft
// page, and a private page must not reach any public payload, whether through
// an edge, a backlink, a generated description, or metadata, and no repo path
// may either.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { environmentFrontmatter } from "../../../site/scripts/build-md-twins.mjs";
import { registryEnvironment } from "../../../site/src/content-core/environment.mjs";
import { publicProjection } from "../../../site/src/content-core/projection.mjs";
import remarkPrerequisitesEnv from "../../../site/src/plugins/remark-prerequisites-env.mjs";
import { emitOne } from "../../emit.mjs";
import remarkModelLinks from "../../plugins/remark-model-links.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";
import { renderConcepts, renderLlmsIndex } from "../discovery.mjs";
import { docPageHead } from "../heads.mjs";
import { modelLinkResolver, readModel } from "../model.mjs";

const ORIGIN = "https://docs.example.io";
const SITE = {
  origin: ORIGIN,
  title: "Example",
  hrefFor: (id) => (id?.area === "docs" ? `/${id.bucket}/${id.slug}` : null),
};
const LEAK = /content\/|architecture\/|envs\/|\.likec4|canonicalDoc|\.py\b/;

// A and C public, B internal; B carries metadata and a description naming a repo path.
const MODEL = {
  elements: {
    alpha: {
      kind: "capability",
      title: "Alpha",
      tags: ["public"],
      summary: { txt: "The public capability." },
    },
    bravo: {
      kind: "implementation",
      title: "Bravo",
      tags: ["service"],
      summary: { txt: "Internal service, see architecture/x.md." },
      metadata: { canonicalDoc: "design/bravo.md" },
      links: [{ url: "https://bravo.internal" }],
    },
    charlie: {
      kind: "openSpecification",
      title: "Charlie",
      tags: ["public"],
      metadata: { canonicalDoc: "design/charlie.md" },
    },
  },
  relations: {
    ab: { kind: "realizes", source: { model: "bravo" }, target: { model: "alpha" } },
    bc: { kind: "implements", source: { model: "bravo" }, target: { model: "charlie" } },
    ca: { kind: "specifies", source: { model: "charlie" }, target: { model: "alpha" } },
  },
};

const doc = (bucket, slug, meta, body = "") => ({
  absPath: `/repo/content/p/${bucket}/${slug}.md`,
  identity: { area: "docs", project: "p", bucket, slug },
  meta: { project: "p", diataxis: bucket, title: slug, ...meta },
  body,
});
const READY = doc(
  "how-to",
  "use-alpha",
  { status: "ready", explains: "alpha", references: ["bravo", "charlie"] },
  ":::prerequisites\n:::\n\nUse [Bravo](model:bravo) with [Charlie](model:charlie).\n",
);
const DRAFT = doc("explanation", "draft-charlie", { status: "draft", explains: "charlie" });
const PRIVATE = doc("reference", "private-list", { status: "private", references: ["alpha"] });
const PAGES = [READY, DRAFT, PRIVATE];

const REGISTRY = {
  "p/compose.yaml": {
    title: "P stack",
    ports: [8080],
    clientEnv: {},
    services: [
      { node: "bravo", element: "bravo", role: "lineage", url: "http://localhost:5000" },
      { node: "charlie", element: "charlie", role: "data_catalog", url: "http://localhost:8080" },
    ],
  },
};
const COMPAT = {
  interfaces: [{ key: "cli", model: "bravo" }],
  journeys: [
    {
      id: "draft.only",
      title: "Proven only on a draft",
      asset: "charlie",
      cells: {
        cli: {
          proofs: [
            {
              script: "content/p/explanation/draft-charlie/snippets/x.py",
              page: { project: "p", bucket: "explanation", slug: "draft-charlie" },
              ready: true,
              works: true,
            },
          ],
        },
      },
    },
    {
      id: "ready.one",
      title: "Proven on the ready page",
      asset: "bravo",
      cells: {
        cli: {
          proofs: [
            {
              script: "content/p/how-to/use-alpha/snippets/y.py",
              page: { project: "p", bucket: "how-to", slug: "use-alpha" },
              anchor: "go",
              ready: true,
              works: true,
            },
          ],
        },
      },
    },
  ],
  verifiedEdges: [
    {
      source: "bravo",
      kind: "implements",
      target: "charlie",
      interfaces: ["cli"],
      journeys: ["ready.one"],
    },
  ],
};

const projection = publicProjection({
  model: MODEL,
  pages: PAGES,
  hrefFor: SITE.hrefFor,
  origin: ORIGIN,
  registry: REGISTRY,
  compat: COMPAT,
});
const ENV = {
  ...registryEnvironment("p/compose.yaml", {
    registry: REGISTRY,
    bundle: "p-env",
    archiveBase: `${ORIGIN}/env`,
  }),
};

async function render(target, base) {
  const dir = mkdtempSync(join(tmpdir(), "visibility-"));
  try {
    const inputPath = join(dir, "index.md");
    writeFileSync(inputPath, `---\ntitle: Use alpha\n---\n\n${READY.body}`);
    // A publish emit's explainers: ready pages only, as emit-docs selects them.
    const explainers = new Map(
      PAGES.filter((p) => p.meta.status === "ready").map((p) => [
        p.meta.explains,
        SITE.hrefFor(p.identity),
      ]),
    );
    const resolve = modelLinkResolver(readModel(MODEL), explainers);
    const { output } = await emitOne({
      inputPath,
      target,
      likec4OutDir: join(dir, "likec4"),
      plugins: [
        [remarkModelLinks, { resolve: (id) => resolve(id, { route: "/how-to/use-alpha" }) }],
        [
          remarkPrerequisitesEnv,
          {
            environment: ENV,
            diataxis: "how-to",
            services: projection.serviceLinks("p/compose.yaml", {
              base,
              route: "/how-to/use-alpha",
            }),
          },
        ],
      ],
    });
    return output;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const concepts = renderConcepts(projection, {
  title: SITE.title,
  origin: ORIGIN,
  environments: [
    {
      key: "p/compose.yaml",
      title: "P stack",
      archive: ENV.bundleUrl,
      guide: "/explanation/draft-charlie",
    },
  ],
});

async function payloads() {
  // A publish emit writes heads for its ready pages only.
  const heads = [docPageHead(SITE, READY, { projection, environment: ENV })];
  const llms = renderLlmsIndex(
    PAGES.filter((p) => p.meta.status === "ready").map((p) => ({
      identity: p.identity,
      diataxis: p.meta.diataxis,
      canonical: `${ORIGIN}/${p.identity.bucket}/${p.identity.slug}`,
      twin: `${ORIGIN}/${p.identity.bucket}/${p.identity.slug}.md`,
      title: p.meta.title,
      description: "A page.",
    })),
    { title: "Example", summary: "Docs.", origin: ORIGIN, concepts: true },
  );
  return {
    site: await render(docsSiteTarget({ assetBase: "/a" }), ""),
    twin: await render(mdTwin, ORIGIN),
    twinFrontmatter: environmentFrontmatter(
      ENV,
      `${ORIGIN}/env/environments.json`,
      projection.serviceLinks("p/compose.yaml").map((s) => s.id),
    ),
    heads: JSON.stringify(heads),
    concepts,
    llms,
  };
}

test("no internal element reaches any payload", async () => {
  for (const [name, text] of Object.entries(await payloads())) {
    // The page's own prose may say "Bravo"; nothing generated may name or link it.
    const generated = text.replaceAll("Use Bravo with", "");
    const found = ["bravo", "Bravo", "Internal service", "bravo.internal"].filter((s) =>
      generated.includes(s),
    );
    expect({ name, found }).toEqual({ name, found: [] });
  }
});

test("the body link to an internal element unwraps to its label", async () => {
  const { site } = await payloads();
  expect(site).toContain("Use Bravo with");
  expect(site).not.toContain("bravo.internal");
});

test("no draft or private page is linked or described", async () => {
  for (const [name, text] of Object.entries(await payloads())) {
    expect({ name, draft: /draft-charlie|Proven only on a draft/.test(text) }).toEqual({
      name,
      draft: false,
    });
    expect({ name, private: text.includes("private-list") }).toEqual({ name, private: false });
  }
});

test("an element explained only by a draft has no explainer URL", () => {
  const charlie = JSON.parse(concepts).concepts.find((c) => c.id === "charlie");
  expect(charlie).toEqual({
    id: "charlie",
    kind: "openSpecification",
    title: "Charlie",
    summary: null,
    url: null,
    sameAs: [],
  });
});

test("only the edge between two public elements is listed, and nothing verifies it", () => {
  const { edges, journeys, environments } = JSON.parse(concepts);
  expect(edges.map((e) => [e.source, e.target, e.verified])).toEqual([["charlie", "alpha", false]]);
  // The ready journey's asset and interface are internal, so they're dropped from it.
  expect(journeys).toEqual([
    {
      id: "ready.one",
      title: "Proven on the ready page",
      asset: null,
      interface: "cli",
      element: null,
      pages: [`${ORIGIN}/how-to/use-alpha#go`],
    },
  ]);
  expect(environments[0].guide).toBeNull();
  expect(environments[0].services.map((s) => s.element)).toEqual(["charlie"]);
});

test("no repo path or model metadata reaches a payload", async () => {
  for (const [name, text] of Object.entries(await payloads())) {
    expect({ name, leak: text.match(LEAK)?.[0] ?? null }).toEqual({ name, leak: null });
  }
});

test("draft and private pages get no concepts in their JSON-LD", () => {
  for (const page of [DRAFT, PRIVATE]) {
    const ld = docPageHead(SITE, page, { projection, environment: ENV }).jsonLd;
    expect(ld.about).toBeUndefined();
    expect(ld.mentions).toBeUndefined();
    expect(ld.tool).toBeUndefined();
  }
});
