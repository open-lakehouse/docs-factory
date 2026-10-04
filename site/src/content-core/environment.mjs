// Page → environment: which `envs/environments.yml` stack a page's scripts run
// against, and the commands that download and start it. Pure (the caller loads
// the registry), so the docs emitter, the twins, and the bundle README derive
// the same commands from one place.

/** `unitycatalog/compose.aws.yaml` → its folder and the `-f` flag to pass. */
export function composeParts(key) {
  const slash = key.lastIndexOf("/");
  const dir = key.slice(0, slash);
  const file = key.slice(slash + 1);
  return { dir, file, flag: file === "compose.yaml" ? "" : `-f ${file} ` };
}

/** `export` lines for a client env, in registry order. */
export function exportLines(clientEnv = {}) {
  return Object.entries(clientEnv).map(([k, v]) => `export ${k}=${v}`);
}

/**
 * The reader's commands for one registry entry: download the bundle, change
 * into the stack's folder, start it, export its client env. `bundle` is the
 * archive's root folder, `bundleUrl` its absolute URL.
 */
export function startCommands(key, env, { bundle, bundleUrl }) {
  const { dir, flag } = composeParts(key);
  return [
    `curl -fsSL ${bundleUrl} | tar -xz`,
    `cd ${bundle}/${dir}`,
    `docker compose ${flag}up -d --wait`,
    ...exportLines(env.clientEnv),
  ];
}

export function stopCommand(key) {
  return `docker compose ${composeParts(key).flag}down`;
}

/**
 * The environment a page's owned scripts need, or null if none needs one.
 * `registry` maps keys to `{ title, ports, clientEnv }`. A page whose scripts
 * name two different stacks throws: one page, one "Start the environment".
 * `runUrl` is set when the page owns exactly one Python script, which a
 * reader can `uv run` straight from its URL.
 */
export function pageEnvironment(scripts, { registry, bundle, bundleUrl, guideHref, origin = "" }) {
  const keys = [...new Set(scripts.map((s) => s.environment).filter(Boolean))].sort();
  if (keys.length === 0) return null;
  if (keys.length > 1) {
    throw new Error(`scripts need more than one environment (${keys.join(", ")})`);
  }
  const [key] = keys;
  const env = registry[key];
  if (!env) throw new Error(`environment ${key} is not in envs/environments.yml`);
  const python = scripts.filter((s) => s.kind === "python");
  return {
    key,
    title: env.title,
    ports: env.ports ?? [],
    clientEnv: env.clientEnv ?? {},
    bundleUrl,
    guideHref,
    commands: startCommands(key, env, { bundle, bundleUrl }),
    stop: stopCommand(key),
    dir: `${bundle}/${composeParts(key).dir}`,
    runUrl: python.length === 1 ? `${origin}${python[0].fetchUrl}` : null,
  };
}

/** "8080" / "8080 and 9000" / "8080, 9000, and 5432". */
export function portList(ports) {
  const p = ports.map(String);
  if (p.length <= 2) return p.join(" and ");
  return `${p.slice(0, -1).join(", ")}, and ${p.at(-1)}`;
}
