// bun build.mjs [outFile] — bundle trestle-view.tsx into one self-contained ES
// module (React, the diagram package, and its CSS inlined), the file a site
// loads with <script type="module">.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(process.argv[2] ?? join(here, "dist", "trestle-webcomponent.mjs"));

const result = await Bun.build({
  entrypoints: [join(here, "trestle-view.tsx")],
  target: "browser",
  format: "esm",
  minify: true,
  // React reads process.env.NODE_ENV; a browser has no process.
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const [bundle, ...rest] = result.outputs;
if (rest.length) throw new Error(`expected one output, got ${result.outputs.length}`);
await Bun.write(outFile, bundle);
console.log(outFile);
