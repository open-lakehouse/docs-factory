#!/usr/bin/env bun
// Render the PNG beside each Trestle graph snapshot (`<stem>.trestle-graph.json`
// → `<stem>.png`) by screenshotting @open-lakehouse/trestle-diagram in headless
// Chromium. Chromium's bytes differ across machines, so the PNG records the
// snapshot's SHA-256 in a tEXt chunk; docsnip checks freshness against that and
// this script skips any PNG that is already current, so re-runs don't churn.
//
// Usage: bun scripts/render-trestle-diagrams.mjs [--force] [<snapshot|dir>...]
// With no paths, renders every snapshot `docsnip diagrams --list` names.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SITE, "..");
const SUFFIX = ".trestle-graph.json";
// Mirrors DIGEST_KEY in tools/docsnip/src/docsnip/diagrams.py.
const DIGEST_KEY = "trestle-graph-sha256";
const WIDTH = 1200;

const args = process.argv.slice(2);
const force = args.includes("--force");
const paths = args.filter((a) => !a.startsWith("--"));

function snapshots() {
  if (paths.length === 0) {
    const out = execFileSync("uv", ["run", "docsnip", "diagrams", "--list"], {
      cwd: REPO,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .filter(Boolean)
      .map((p) => join(REPO, p));
  }
  return paths.map((p) => {
    const abs = resolve(REPO, p);
    // A directory means its environment snapshot (envs/<name>/diagram…).
    return existsSync(abs) && statSync(abs).isDirectory() ? join(abs, `diagram${SUFFIX}`) : abs;
  });
}

// --- PNG tEXt chunk ---------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunks(png) {
  const found = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const length = png.readUInt32BE(at);
    found.push({ at, end: at + 12 + length, type: png.toString("latin1", at + 4, at + 8) });
    at += 12 + length;
  }
  return found;
}

function recordedDigest(png) {
  for (const { at, end, type } of chunks(png)) {
    if (type !== "tEXt") continue;
    const body = png.subarray(at + 8, end - 4);
    const nul = body.indexOf(0);
    if (body.toString("latin1", 0, nul) === DIGEST_KEY) return body.toString("latin1", nul + 1);
  }
  return null;
}

/** `png` with a tEXt chunk recording `digest`, right after IHDR. */
function stamp(png, digest) {
  const data = Buffer.from(`${DIGEST_KEY}\0${digest}`, "latin1");
  const typed = Buffer.concat([Buffer.from("tEXt", "latin1"), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typed.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typed), 8 + data.length);
  const ihdrEnd = chunks(png)[0].end;
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

// --- rendering --------------------------------------------------------------

async function bundle() {
  const built = await Bun.build({
    entrypoints: [join(SITE, "scripts", "trestle-diagram-page.tsx")],
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!built.success) throw new AggregateError(built.logs, "bundling the diagram page failed");
  const css = readFileSync(
    join(SITE, "node_modules", "@open-lakehouse", "trestle-diagram", "dist", "styles.css"),
    "utf8",
  );
  // Inlined, so a literal `</script` in the bundle must not end the element.
  const js = (await built.outputs[0].text()).replaceAll("</script", "<\\/script");
  // Edges animate (dash offsets); a still frame must not depend on timing.
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
*, *::before, *::after { animation: none !important; transition: none !important; }
html, body { margin: 0; background: #fff; }
#root { width: ${WIDTH}px; padding: 16px; box-sizing: content-box; }
</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`;
}

async function render(page, html, snapshot) {
  await page.setContent(html);
  await page.waitForFunction(() => typeof window.renderDiagram === "function");
  await page.evaluate((s) => window.renderDiagram(s), snapshot);
  const nodes = snapshot.graph.nodes.length;
  await page.waitForFunction(
    // A hosted node's cloud frame is a React Flow node of its own.
    (n) => document.querySelectorAll(".react-flow__node:not(.react-flow__node-cloud)").length === n,
    nodes,
    { timeout: 30_000 },
  );
  // ELK lays out asynchronously, then React Flow fits the view: wait until the
  // viewport transform holds still.
  await page.waitForFunction(
    () =>
      new Promise((done) => {
        const viewport = document.querySelector(".react-flow__viewport");
        const before = viewport?.getAttribute("style");
        setTimeout(() => done(Boolean(before) && viewport.getAttribute("style") === before), 300);
      }),
    null,
    { timeout: 30_000, polling: 100 },
  );
  return page.locator(".trestle-diagram").first().screenshot({ animations: "disabled" });
}

const targets = snapshots();
const stale = targets.filter((path) => {
  const png = path.replace(SUFFIX, ".png");
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  return force || !existsSync(png) || recordedDigest(readFileSync(png)) !== digest;
});
if (stale.length === 0) {
  console.log(`trestle diagrams: ${targets.length} current`);
  process.exit(0);
}

const html = await bundle();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2, reducedMotion: "reduce" });
  page.on("pageerror", (err) => console.error(`diagram page: ${err.message}`));
  for (const path of stale) {
    const bytes = readFileSync(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const png = stamp(await render(page, html, JSON.parse(bytes.toString("utf8"))), digest);
    const out = path.replace(SUFFIX, ".png");
    writeFileSync(out, png);
    console.log(`rendered ${relative(REPO, out)}`);
  }
} finally {
  await browser.close();
}
