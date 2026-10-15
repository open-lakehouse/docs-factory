/**
 * envs/environments.yml, read from disk (Node-only, like walk.mjs): the docs
 * emitter and the review app derive a page's environment from the same entries.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

/** envs/environments.yml as `{ key: { title, ports, clientEnv } }`. */
export function loadRegistry(repoRoot) {
  const raw = yaml.load(readFileSync(join(repoRoot, "envs", "environments.yml"), "utf8")) ?? {};
  return Object.fromEntries(
    Object.entries(raw.environments ?? {}).map(([key, e]) => [
      key,
      { title: e.title, ports: e.ports ?? [], clientEnv: e["client-env"] ?? {} },
    ]),
  );
}
