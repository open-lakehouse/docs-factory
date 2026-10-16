// loadRegistry: authored entries as written; generated ones merge their plan facts.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry } from "../registry.mjs";

function repo(registry, generated) {
  const root = mkdtempSync(join(tmpdir(), "registry-"));
  mkdirSync(join(root, "envs"));
  writeFileSync(join(root, "envs", "environments.yml"), registry);
  if (generated) {
    writeFileSync(join(root, "envs", "environments.generated.json"), JSON.stringify(generated));
  }
  return root;
}

const AUTHORED = `environments:
  unitycatalog/compose.yaml:
    title: UC
    ports: [8080]
`;

test("an authored entry reads as written", () => {
  expect(loadRegistry(repo(AUTHORED))["unitycatalog/compose.yaml"]).toEqual({
    title: "UC",
    ports: [8080],
    clientEnv: {},
    guide: null,
    files: null,
  });
});

test("a generated entry takes ports, client env, and files from the derived facts", () => {
  const root = repo(
    `${AUTHORED}  uc-aws/compose.yaml:
    title: UC with S3
    generated: uc-aws
`,
    {
      version: 1,
      environments: {
        "uc-aws": {
          ports: [8080, 9000],
          "client-env": { AWS_REGION: "us-east-1" },
          files: ["compose.yaml"],
        },
      },
    },
  );
  expect(loadRegistry(root)["uc-aws/compose.yaml"]).toEqual({
    title: "UC with S3",
    ports: [8080, 9000],
    clientEnv: { AWS_REGION: "us-east-1" },
    guide: null,
    files: ["compose.yaml"],
  });
});

test("a generated entry without derived facts fails", () => {
  const root = repo(`${AUTHORED}  uc-aws/compose.yaml:
    title: UC with S3
    generated: uc-aws
`);
  expect(() => loadRegistry(root)).toThrow(/no 'uc-aws'/);
});
