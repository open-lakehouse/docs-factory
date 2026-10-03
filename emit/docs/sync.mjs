/**
 * Manifest-driven sync of a fully rendered site into its target directory, and
 * the page-level change report. Pure apart from `applySync`, for testing.
 *
 * Every emit renders the WHOLE site in memory. The sync then writes only files
 * whose bytes differ from what's on disk, deletes files the previous emit wrote
 * that this one didn't, and never touches anything outside OWNED, so the shell's
 * own files are safe even from a corrupt manifest.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const MANIFEST_FILE = ".docs-emit.json";
export const OWNED = ["src/content/", "src/generated/", "src/vendor/", "public/"];

export function isOwned(path) {
  return OWNED.some((prefix) => path.startsWith(prefix)) && !path.split("/").includes("..");
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * @param {Map<string, string|Buffer>} files   target-relative path → content
 * @param {object|null} previous               the previous manifest, if any
 * @param {(path: string) => string|null} diskHash  sha256 of the file on disk, or null
 * @returns {{ write: string[], remove: string[], unchanged: number, hashes: Record<string,string> }}
 */
export function planSync(files, previous, diskHash) {
  const hashes = {};
  const write = [];
  let unchanged = 0;
  for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isOwned(path)) throw new Error(`emitter tried to write outside its owned paths: ${path}`);
    const hash = sha256(content);
    hashes[path] = hash;
    // Compare against the disk, not the manifest, so a hand edit is overwritten.
    if (diskHash(path) === hash) unchanged++;
    else write.push(path);
  }
  const remove = Object.keys(previous?.files ?? {})
    .filter((path) => !(path in hashes) && isOwned(path))
    .sort();
  return { write, remove, unchanged, hashes };
}

/** Apply a plan: write, delete, then prune directories the deletes emptied. */
export function applySync(outDir, files, plan) {
  for (const path of plan.write) {
    const abs = join(outDir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, files.get(path));
  }
  for (const path of plan.remove) {
    rmSync(join(outDir, path), { force: true });
    let dir = dirname(path);
    while (isOwned(`${dir}/`) && existsSync(join(outDir, dir))) {
      if (readdirSync(join(outDir, dir)).length) break;
      rmdirSync(join(outDir, dir));
      dir = dirname(dir);
    }
  }
}

export function diskHasher(outDir) {
  return (path) => {
    const abs = join(outDir, path);
    return existsSync(abs) ? sha256(readFileSync(abs)) : null;
  };
}

/** Sections (anchor → hash) that were added, removed, or changed, in page order. */
export function changedSections(prev = {}, next = {}) {
  const out = Object.keys(next).filter((anchor) => prev[anchor] !== next[anchor]);
  for (const anchor of Object.keys(prev)) if (!(anchor in next)) out.push(anchor);
  return out;
}

/**
 * Page-level diff of two manifests. A removed page and an added page with the
 * same contentHash are one rename. A page whose source hashes are unchanged but
 * whose outputs differ is a render-only change (emitter, shell contract, nav).
 */
export function diffPages(previous, next) {
  const before = previous?.pages ?? {};
  const after = next.pages;
  const added = Object.keys(after).filter((k) => !before[k]);
  const removed = Object.keys(before).filter((k) => !after[k]);

  const renamed = [];
  for (const from of [...removed]) {
    const to = added.find((k) => after[k].contentHash === before[from].contentHash);
    if (!to) continue;
    renamed.push({ from, to, fromRoute: before[from].route, toRoute: after[to].route });
    removed.splice(removed.indexOf(from), 1);
    added.splice(added.indexOf(to), 1);
  }

  const changed = [];
  const renderOnly = [];
  const nextFiles = next.files ?? {};
  for (const key of Object.keys(after)) {
    const p = before[key];
    if (!p) continue;
    const n = after[key];
    if (p.rootHash !== n.rootHash || p.contentHash !== n.contentHash) {
      changed.push({ key, route: n.route, sections: changedSections(p.sections, n.sections) });
    } else if (
      p.route !== n.route ||
      n.outputs.some((o) => previous.files?.[o] !== nextFiles[o]) ||
      p.outputs.length !== n.outputs.length
    ) {
      renderOnly.push({ key, route: n.route });
    }
  }
  return {
    added: added.map((key) => ({ key, route: after[key].route, title: after[key].title })),
    removed: removed.map((key) => ({ key, route: before[key].route })),
    renamed,
    changed,
    renderOnly,
  };
}

/** Markdown change report, usable as a PR body section. */
export function renderReport({ site, source, diff, plan }) {
  const lines = [`## Docs emit: ${site}`, ""];
  lines.push(`Source: \`${source.commit}\`${source.dirty ? " (uncommitted changes)" : ""}`, "");
  const counts = [
    `${diff.added.length} added`,
    `${diff.changed.length} changed`,
    `${diff.removed.length} removed`,
    `${diff.renamed.length} renamed`,
    `${diff.renderOnly.length} render-only`,
  ];
  lines.push(`Pages: ${counts.join(", ")}`, "");
  for (const a of diff.added) lines.push(`- added \`${a.route}\` — ${a.title}`);
  for (const c of diff.changed) {
    const where = c.sections.length
      ? ` (sections: ${c.sections.map((s) => `\`${s}\``).join(", ")})`
      : "";
    lines.push(`- changed \`${c.route}\`${where}`);
  }
  for (const r of diff.renamed) lines.push(`- renamed \`${r.fromRoute}\` → \`${r.toRoute}\``);
  for (const r of diff.removed) lines.push(`- removed \`${r.route}\``);
  for (const r of diff.renderOnly) lines.push(`- render-only \`${r.route}\``);
  lines.push(
    "",
    `Files: ${plan.write.length} written, ${plan.remove.length} removed, ${plan.unchanged} unchanged`,
    "",
  );
  return lines.join("\n");
}
