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
 * The reader's commands for one registry entry: download the bundle, start
 * the stack from its folder, export its client env. `bundle` is the
 * archive's root folder, `bundleUrl` its absolute URL.
 */
export function startCommands(key, env, { bundle, bundleUrl }) {
  const { dir, flag } = composeParts(key);
  return [
    `curl -fsSL ${bundleUrl} | tar -xz`,
    `cd ${bundle}/${dir} && docker compose ${flag}up -d --wait`,
    ...exportLines(env.clientEnv),
  ];
}

export function stopCommand(key) {
  return `docker compose ${composeParts(key).flag}down`;
}

// `:::prerequisites{environment="unitycatalog/compose.yaml"}`
const DECLARED_RE = /^:{3,}prerequisites\{[^}\n]*\benvironment="([^"]+)"/m;

/** The environment a page body declares on its `:::prerequisites`, if any. */
export function declaredEnvironment(body) {
  return DECLARED_RE.exec(body)?.[1] ?? null;
}

/**
 * The environment a page's owned scripts need, or null if none needs one.
 * `registry` maps keys to `{ title, ports, clientEnv, guide }`. A page whose scripts
 * name two different stacks throws: one page, one set of start commands.
 * `declared` (declaredEnvironment) is for a page with no scripts of its own
 * that still walks the reader through a stack; scripts must agree with it.
 */
export function pageEnvironment(scripts, { registry, bundle, bundleUrl, declared = null }) {
  const keys = [
    ...new Set([declared, ...scripts.map((s) => s.environment)].filter(Boolean)),
  ].sort();
  if (keys.length === 0) return null;
  if (keys.length > 1) {
    throw new Error(`scripts need more than one environment (${keys.join(", ")})`);
  }
  const [key] = keys;
  return registryEnvironment(key, { registry, bundle, bundleUrl });
}

/**
 * One registry entry with its reader commands, independent of any page: what
 * a keyed `:::environment{key="…"}` marker renders. Throws on an unknown key.
 */
export function registryEnvironment(key, { registry, bundle, bundleUrl }) {
  const env = registry[key];
  if (!env) throw new Error(`environment ${key} is not in envs/environments.yml`);
  return {
    key,
    title: env.title,
    ports: env.ports ?? [],
    clientEnv: env.clientEnv ?? {},
    guide: env.guide ?? null,
    bundleUrl,
    commands: startCommands(key, env, { bundle, bundleUrl }),
    stop: stopCommand(key),
    dir: `${bundle}/${composeParts(key).dir}`,
    runUrl: null,
  };
}

/** "8080" / "8080 and 9000" / "8080, 9000, and 5432". */
export function portList(ports) {
  const p = ports.map(String);
  if (p.length <= 2) return p.join(" and ");
  return `${p.slice(0, -1).join(", ")}, and ${p.at(-1)}`;
}

/**
 * The page a how-to's pointer bullet links for `env`: its registry `guide`
 * (`<bucket>/<slug>[#anchor]`), else the site's default `siteGuide`
 * (`{ bucket, slug }`). One that is the page itself (`self`, a route) or isn't
 * published falls through to the next. `resolve(bucket, slug)` is
 * `{ href, title }` for a published page, else null.
 */
export function environmentGuide(env, { siteGuide = null, resolve, self = null }) {
  const refs = [env.guide, siteGuide && `${siteGuide.bucket}/${siteGuide.slug}`];
  for (const ref of refs.filter(Boolean)) {
    const [path, anchor] = ref.split("#");
    const [bucket, slug] = path.split("/");
    const page = resolve(bucket, slug);
    if (!page || page.href === self) continue;
    return { href: anchor ? `${page.href}#${anchor}` : page.href, title: page.title };
  }
  return null;
}
