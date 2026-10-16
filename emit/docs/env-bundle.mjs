/**
 * The downloadable environment bundle: the envs/ folders a site's examples run
 * against, as one deterministic `<bundle>.tar.gz` a reader pipes into `tar -xz`,
 * plus `environments.json`, its machine-readable index for agents.
 *
 * The archive keeps the envs/ layout under one root folder, so relative
 * references between stacks still resolve. A generated environment ships only
 * its runtime-file manifest (`files` in envs/environments.generated.json), never
 * its recipe or plan. Byte-identical output for identical inputs keeps planSync
 * from rewriting it on every emit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  composeParts,
  exportLines,
  portList,
  startCommands,
  stopCommand,
} from "../../site/src/content-core/environment.mjs";

export { loadRegistry } from "../../site/src/content-core/registry.mjs";

// READMEs describe the repo's test setup; example/ is aws-sim's own demo.
const EXCLUDE = /(^|\/)(README\.md|example\/.*)$/;

/**
 * The files under `envs/<dir>/` for each dir, as paths relative to envs/: a
 * generated environment's manifest, else every tracked file. A manifest file
 * that isn't tracked throws, since CI couldn't have run it.
 */
export function bundlePaths(repoRoot, dirs, registry = {}) {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...dirs.map((d) => `envs/${d}/`)], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const tracked = out
    .split("\0")
    .filter(Boolean)
    .map((p) => p.slice("envs/".length));
  const manifests = new Map(
    Object.entries(registry)
      .filter(([, env]) => env.files)
      .map(([key, env]) => [
        composeParts(key).dir,
        env.files.map((f) => `${composeParts(key).dir}/${f}`),
      ]),
  );
  const paths = dirs.flatMap((dir) => {
    const manifest = manifests.get(dir);
    if (!manifest) return tracked.filter((p) => p.startsWith(`${dir}/`) && !EXCLUDE.test(p));
    const missing = manifest.filter((p) => !tracked.includes(p));
    if (missing.length)
      throw new Error(`env bundle: not tracked by git: envs/${missing.join(", envs/")}`);
    return manifest;
  });
  return paths.sort();
}

function octal(n, width) {
  return `${n.toString(8).padStart(width - 1, "0")}\0`;
}

/** One ustar header block for a regular file (owner root, mode 0644, mtime 0). */
function tarHeader(name, size) {
  if (Buffer.byteLength(name) > 100) throw new Error(`tar: path too long: ${name}`);
  const h = Buffer.alloc(512);
  h.write(name, 0);
  h.write(octal(0o644, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(0, 12), 136);
  h.write(" ".repeat(8), 148);
  h.write("0", 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return h;
}

/** A gzipped ustar archive of `entries` (`[{ name, data }]`), in the given order. */
export function tarGz(entries) {
  const blocks = [];
  for (const { name, data } of entries) {
    const body = Buffer.from(data);
    blocks.push(tarHeader(name, body.length), body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(blocks), { level: 9 });
  // zlib stamps the build platform's OS code; "unknown" makes macOS and Linux agree.
  gz[9] = 0xff;
  return gz;
}

/** The archive's top-level README: what each stack is and how to run it. */
export function bundleReadme({ bundle, registry, keys, siteTitle, guideUrl }) {
  const rows = keys.map((key) => {
    const { dir, flag } = composeParts(key);
    const env = registry[key];
    return `| \`${dir}/\` | \`docker compose ${flag}up -d --wait\` | ${env.title} | ${portList(env.ports)} |`;
  });
  const exports = keys.flatMap((key) =>
    Object.keys(registry[key].clientEnv).length
      ? [
          "",
          `${registry[key].title} also needs, in each terminal you run examples from:`,
          "",
          "```bash",
          ...exportLines(registry[key].clientEnv),
          "```",
        ]
      : [],
  );
  return [
    `# ${bundle}`,
    "",
    `Local stacks for the ${siteTitle} documentation. Each needs Docker with Compose v2.`,
    "Run the command from the folder in the first column:",
    "",
    "| Folder | Start | Runs | Host ports |",
    "| --- | --- | --- | --- |",
    ...rows,
    ...exports,
    "",
    "Stop a stack from the same folder with `docker compose down`, adding the same",
    "`-f` option you started it with.",
    ...(guideUrl ? ["", `More: ${guideUrl}`] : []),
    "",
  ].join("\n");
}

/**
 * The bundle for one site: `{ archive, index }`. `index` is environments.json,
 * the stacks it contains with their exact start and stop commands.
 */
export function buildEnvBundle({ repoRoot, bundle, dirs, registry, origin, siteTitle, guideUrl }) {
  const paths = bundlePaths(repoRoot, dirs, registry);
  // Registry order: the base stack first, then its variants.
  const keys = Object.keys(registry).filter((k) => paths.includes(k));
  const bundleUrl = `${origin}/env/${bundle}.tar.gz`;
  const readme = bundleReadme({ bundle, registry, keys, siteTitle, guideUrl });
  const archive = tarGz([
    { name: `${bundle}/README.md`, data: readme },
    ...paths.map((p) => ({
      name: `${bundle}/${p}`,
      data: readFileSync(join(repoRoot, "envs", p)),
    })),
  ]);
  const environments = keys.map((key) => {
    const env = registry[key];
    return {
      key,
      title: env.title,
      ports: env.ports,
      env: env.clientEnv,
      dir: `${bundle}/${composeParts(key).dir}`,
      start: startCommands(key, env, { bundle, bundleUrl }),
      stop: stopCommand(key),
    };
  });
  const index = { version: 1, bundle: bundleUrl, guide: guideUrl, environments };
  return { archive, index, bundleUrl, keys };
}
