/**
 * The downloadable environments: each envs/ folder a site's examples run
 * against, as its own deterministic `<dir>.tar.gz` a reader pipes into
 * `tar -xz`, plus `environments.json`, their machine-readable index for agents.
 *
 * Every archive extracts into the same root folder (`<bundle>/<dir>/`), so the
 * paths pages name hold however many a reader downloads. A generated
 * environment ships only its runtime-file manifest (`files` in
 * envs/environments.generated.json). Byte-identical output for identical inputs
 * keeps planSync from rewriting it on every emit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  archiveUrl,
  composeParts,
  startCommands,
  stopCommand,
} from "../../site/src/content-core/environment.mjs";

export { loadRegistry } from "../../site/src/content-core/registry.mjs";

// A hand-written folder's README describes the repo's test setup. A generated
// environment's README is Trestle's deployment guide, so its manifest ships it.
const EXCLUDE = /(^|\/)README\.md$/;

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

/**
 * The archives for one site: `{ archives, index, archiveBase }`. `archives`
 * maps each dir to its `.tar.gz`; `index` is environments.json, each stack with
 * its archive and exact start and stop commands.
 */
export function buildEnvBundles({ repoRoot, bundle, dirs, registry, origin, guideUrl }) {
  const archiveBase = `${origin}/env`;
  const archives = new Map(
    dirs.map((dir) => [
      dir,
      tarGz(
        bundlePaths(repoRoot, [dir], registry).map((p) => ({
          name: `${bundle}/${p}`,
          data: readFileSync(join(repoRoot, "envs", p)),
        })),
      ),
    ]),
  );
  // Registry order: the base stack first, then its variants.
  const keys = Object.keys(registry).filter((k) => dirs.includes(composeParts(k).dir));
  const environments = keys.map((key) => {
    const env = registry[key];
    return {
      key,
      title: env.title,
      ports: env.ports,
      env: env.clientEnv,
      archive: archiveUrl(key, archiveBase),
      dir: `${bundle}/${composeParts(key).dir}`,
      start: startCommands(key, env, { bundle, archiveBase }),
      stop: stopCommand(key),
    };
  });
  const index = { version: 2, guide: guideUrl, environments };
  return { archives, index, archiveBase, keys };
}
