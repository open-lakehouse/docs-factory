// The review app's page → environment resolver, over hand-built docsnip entries
// and a one-entry registry, so no uv or envs/ checkout is needed.
import { expect, test } from "bun:test";
import { environmentResolver } from "../page-environments.mjs";

const SITE = {
  project: "uc",
  origin: "https://d.io",
  env: { bundle: "uc-docs-env", guide: { bucket: "how-to", slug: "run-local-server" } },
  hrefFor: (id) => (id?.area === "docs" && id.project === "uc" ? `/${id.bucket}/${id.slug}` : null),
};
const OTHER = { project: "delta", origin: "https://x.io", hrefFor: () => null };

const entry = (path, environment = "uc/compose.yaml") => ({
  path,
  tutorial_slug: path.split("/")[3].replace(/^\d+-/, ""),
  environment,
  compose: environment && `../../../envs/${environment}`,
});

const resolve = environmentResolver({
  entries: [entry("content/uc/how-to/005-s3/snippets/s3.py")],
  registry: { "uc/compose.yaml": { title: "UC", ports: [8080], clientEnv: {} } },
  sites: [SITE, OTHER],
  readPage: () => "---\ntitle: Run a local server\n---\n",
});

const page = (dir, body = ":::prerequisites\n:::\n") => [
  `/repo/content/${dir}/index.md`,
  `---\ntitle: T\n---\n\n${body}`,
];

test("a page owning a stack script gets the stack, its run URL, and the in-app guide", () => {
  const { environment, guide, diataxis } = resolve(...page("uc/how-to/005-s3"));
  expect(diataxis).toBe("how-to");
  expect(environment.title).toBe("UC");
  expect(environment.commands[0]).toBe("curl -fsSL https://d.io/env/uc-docs-env.tar.gz | tar -xz");
  expect(environment.runUrl).toBe("https://d.io/how-to/s3/snippets/s3.py");
  expect(guide).toEqual({ href: "/docs/uc/how-to/run-local-server", title: "Run a local server" });
});

test("a page without scripts gets its declared stack, and the guide skips itself", () => {
  const declared = ':::prerequisites{environment="uc/compose.yaml"}\n:::\n';
  const { environment, guide } = resolve(...page("uc/how-to/011-run-local-server", declared));
  expect(environment.title).toBe("UC");
  expect(guide).toBeNull();
});

test("no stack, or a project without an env bundle, leaves the box as authored", () => {
  expect(resolve(...page("uc/how-to/007-plain")).environment).toBeNull();
  expect(resolve(...page("delta/how-to/001-read"))).toBeNull();
});

test("a registry guide links its section of the page that starts the stack", () => {
  const withGuide = environmentResolver({
    entries: [entry("content/uc/how-to/005-s3/snippets/s3.py")],
    registry: {
      "uc/compose.yaml": {
        title: "UC",
        ports: [8080],
        clientEnv: {},
        guide: "how-to/run-local-server#with-s3",
      },
    },
    sites: [SITE],
    readPage: () => "---\ntitle: Run a local server\n---\n",
  });
  const { guide } = withGuide(...page("uc/how-to/005-s3"));
  expect(guide.href).toBe("/docs/uc/how-to/run-local-server#with-s3");
});

test("a keyed marker resolves any registry stack, even on a page without one", () => {
  const { resolve: keyed } = resolve(...page("uc/how-to/007-plain"));
  expect(keyed("uc/compose.yaml").commands[1]).toBe(
    "cd uc-docs-env/uc && docker compose up -d --wait",
  );
  expect(() => keyed("uc/nope.yaml")).toThrow("uc/nope.yaml is not in envs/environments.yml");
});

test("the diagrams' folder reaches the plugin", () => {
  const withDiagrams = environmentResolver({
    entries: [entry("content/uc/how-to/005-s3/snippets/s3.py")],
    registry: { "uc/compose.yaml": { title: "UC", ports: [8080], clientEnv: {} } },
    sites: [SITE],
    readPage: () => "---\ntitle: Run a local server\n---\n",
    envsDir: "/repo/envs",
  });
  expect(withDiagrams(...page("uc/how-to/005-s3")).envsDir).toBe("/repo/envs");
  expect(withDiagrams(...page("uc/how-to/007-plain")).envsDir).toBe("/repo/envs");
  expect(resolve(...page("uc/how-to/005-s3")).envsDir).toBeNull();
});
