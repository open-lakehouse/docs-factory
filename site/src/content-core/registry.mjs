/**
 * envs/environments.yml, read from disk (Node-only, like walk.mjs): the docs
 * emitter and the review app derive a page's environment from the same entries.
 * A `generated: <name>` entry takes its ports, client env, services, and bundle files
 * from envs/environments.generated.json, which `docsnip envs --fix` derives
 * from the environment's plan.json; this reader merges it and never derives.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

/**
 * envs/environments.yml as `{ key: { title, ports, clientEnv, guide, services, files } }`.
 * `services` is `[{ node, element, role, url }]`, the plan's graph nodes (empty
 * for a hand-written entry); `files` (paths relative to the compose file's
 * folder) is null for a hand-written entry.
 */
export function loadRegistry(repoRoot) {
  const raw = yaml.load(readFileSync(join(repoRoot, "envs", "environments.yml"), "utf8")) ?? {};
  const derivedPath = join(repoRoot, "envs", "environments.generated.json");
  const derived = existsSync(derivedPath)
    ? (JSON.parse(readFileSync(derivedPath, "utf8")).environments ?? {})
    : {};
  return Object.fromEntries(
    Object.entries(raw.environments ?? {}).map(([key, authored]) => {
      let e = authored;
      if (authored.generated) {
        const facts = derived[authored.generated];
        if (!facts) {
          throw new Error(
            `envs/environments.yml: ${key}: envs/environments.generated.json has no '${authored.generated}'`,
          );
        }
        e = { ...authored, ...facts };
      }
      return [
        key,
        {
          title: e.title,
          ports: e.ports ?? [],
          clientEnv: e["client-env"] ?? {},
          guide: e.guide ?? null,
          services: authored.generated ? (e.services ?? []) : [],
          files: authored.generated ? (e.files ?? []) : null,
        },
      ];
    }),
  );
}
