/**
 * Canonical file= / start= / end= code-fence resolution.
 *
 * This is THE one implementation. Previously the region resolution lived in
 * three places that had to "mirror" each other by comment:
 *   - site/src/plugins/remark-code-snippets.mjs (render: dedented text)
 *   - site/scripts/build-version-manifest.mjs   (manifest: line ranges, NOT dedented)
 *   - tools/docsnip/snippetcheck.py             (validation, Python — still validates)
 * The render side and the manifest disagreed on dedent, so the DB stored source
 * text/line ranges that did not match what a reviewer saw rendered, breaking
 * code-comment re-anchoring. Both JS callers now go through {@link resolveFence},
 * so the rendered block and the manifest's stored snippet come from one code path.
 *
 * DOM-free and Vite-free. `readFileSync` stays in the *callers* (they own path
 * resolution relative to the markdown); this module works on already-read text.
 */

export const FILE_RE = /\bfile=(\S+)/;
export const START_RE = /\bstart=(\S+)/;
export const END_RE = /\bend=(\S+)/;

/** Parse a fence info string. Returns null when it carries no `file=`. */
export function parseFenceMeta(meta) {
  const fileM = (meta ?? "").match(FILE_RE);
  if (!fileM) return null;
  const startM = meta.match(START_RE);
  const endM = meta.match(END_RE);
  return {
    file: fileM[1],
    start: startM ? startM[1] : null,
    end: endM ? endM[1] : null,
  };
}

/** Count lines containing `marker` as a substring. */
export function countMarker(lines, marker) {
  let n = 0;
  for (const line of lines) if (line.includes(marker)) n++;
  return n;
}

/** 0-based index of the unique line containing `marker`, or -1 if not unique. */
export function markerLine(lines, marker) {
  let idx = -1;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) {
      if (n === 0) idx = i;
      n++;
    }
  }
  return n === 1 ? idx : -1;
}

/** Strip the common leading indentation from a block of lines, joined with \n. */
export function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^\s*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

/**
 * Resolve a fence against its (already-read) source text.
 *
 * Returns the SAME object shape for both the render adapter and the manifest:
 *   - text:      the resolved snippet text, DEDENTED and with the trailing
 *                newline stripped — exactly what the rendered code block shows.
 *   - startLine: 1-based source line the inlined region begins at (the line
 *                after the start marker; 1 for a whole-file fence).
 *   - endLine:   1-based source line the region ends at (the line before the
 *                end marker; the file's last line for a whole-file fence).
 *   - region:    "start..end" for a region fence, "" for whole-file.
 *
 * Throws with a clear message on a missing/duplicated marker — a broken fence
 * fails the build rather than silently rendering an empty block.
 */
export function resolveFence(srcText, { start, end } = {}) {
  const normalized = srcText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (!start && !end) {
    // Whole file, minus a single trailing newline. endLine counts the content
    // lines of the returned text (a lone trailing newline is not its own line).
    const text = normalized.replace(/\n$/, "");
    return {
      text,
      startLine: 1,
      endLine: text === "" ? 0 : text.split("\n").length,
      region: "",
    };
  }
  if (!start || !end) {
    throw new Error(
      "snippet fence must include both start= and end=, or neither (whole-file inlining)",
    );
  }

  for (const [marker, kind] of [
    [start, "start"],
    [end, "end"],
  ]) {
    const n = countMarker(lines, marker);
    if (n === 0) throw new Error(`${kind} marker '${marker}' not found`);
    if (n > 1) throw new Error(`${kind} marker '${marker}' found ${n}× (must be unique)`);
  }

  const s = markerLine(lines, start);
  const e = markerLine(lines, end);
  if (e <= s) throw new Error(`end marker '${end}' does not follow start marker '${start}'`);

  // Region strictly between the markers, markers excluded. Text is dedented for
  // display AND for the manifest's stored text; startLine/endLine are the true
  // 1-based source line numbers of that region (before dedent) for linking.
  const regionLines = lines.slice(s + 1, e);
  return {
    text: dedent(regionLines),
    startLine: s + 2, // 1-based, first line after the start marker
    endLine: e, // 1-based line before the end marker (e is the 0-based end marker index)
    region: `${start}..${end}`,
  };
}
