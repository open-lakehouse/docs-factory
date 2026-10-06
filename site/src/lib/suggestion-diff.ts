// The diff a suggested edit renders as: original vs replacement, by words for
// prose and by lines for code. A plain LCS over tokens; passages are a
// selection, not a file, so quadratic is fine up to MAX_CELLS.

export type DiffPart = { kind: "same" | "del" | "ins"; text: string };

/** Above this many LCS cells, show the whole passage as removed + added. */
const MAX_CELLS = 2_000_000;

function tokenize(s: string, by: "words" | "lines"): string[] {
  // Whitespace runs are their own tokens, so joining parts restores the text.
  return by === "words" ? s.split(/(\s+)/).filter(Boolean) : s.split(/(?<=\n)/);
}

/** Merge adjacent parts of the same kind. */
function push(parts: DiffPart[], kind: DiffPart["kind"], text: string) {
  const last = parts[parts.length - 1];
  if (last?.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

export function diffSuggestion(
  original: string,
  replacement: string,
  by: "words" | "lines" = "words",
): DiffPart[] {
  const a = tokenize(original, by);
  const b = tokenize(replacement, by);
  const parts: DiffPart[] = [];
  if (a.length * b.length > MAX_CELLS) {
    if (original) parts.push({ kind: "del", text: original });
    if (replacement) parts.push({ kind: "ins", text: replacement });
    return parts;
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..], filled bottom-up.
  const w = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, "same", a[i++]);
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      push(parts, "del", a[i++]);
    } else {
      push(parts, "ins", b[j++]);
    }
  }
  while (i < a.length) push(parts, "del", a[i++]);
  while (j < b.length) push(parts, "ins", b[j++]);
  return parts;
}
