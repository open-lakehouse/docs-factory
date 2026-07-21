import type { ExplainEntry, ExplainKind } from "../explain";
import { explainEntries } from "../explain";

export type BootLine =
  | { type: "command"; text: string }
  | { type: "status"; text: string; muted?: boolean }
  | { type: "load"; entry: ExplainEntry }
  | { type: "summary"; capabilities: number; specifications: number; implementations: number }
  | { type: "explore" };

const KIND_ORDER: ExplainKind[] = [
  "capability",
  "openSpecification",
  "implementation",
];

const KIND_TAG: Record<ExplainKind, string> = {
  capability: "capability",
  openSpecification: "specification",
  implementation: "implementation",
};

const KIND_PLURAL: Record<ExplainKind, string> = {
  capability: "capabilities",
  openSpecification: "specifications",
  implementation: "implementations",
};

const MAX_PER_KIND = 5;

export function kindTag(kind: ExplainKind): string {
  return KIND_TAG[kind];
}

export function buildBootSequence(): BootLine[] {
  const byKind = {
    capability: explainEntries.filter((e) => e.kind === "capability"),
    openSpecification: explainEntries.filter((e) => e.kind === "openSpecification"),
    implementation: explainEntries.filter((e) => e.kind === "implementation"),
  };

  const lines: BootLine[] = [
    { type: "command", text: "open-lakehouse init" },
    { type: "status", text: "loading LikeC4 estate model…" },
    { type: "status", text: "logical · deployment · views", muted: true },
  ];

  for (const kind of KIND_ORDER) {
    const entries = byKind[kind];
    if (entries.length === 0) continue;
    lines.push({
      type: "status",
      text: `indexing ${KIND_PLURAL[kind]} (${entries.length})…`,
      muted: true,
    });
    const shown = entries.slice(0, MAX_PER_KIND);
    for (const entry of shown) {
      lines.push({ type: "load", entry });
    }
    if (entries.length > shown.length) {
      lines.push({
        type: "status",
        text: `… +${entries.length - shown.length} more`,
        muted: true,
      });
    }
  }

  lines.push({
    type: "summary",
    capabilities: byKind.capability.length,
    specifications: byKind.openSpecification.length,
    implementations: byKind.implementation.length,
  });
  lines.push({ type: "command", text: "open-lakehouse explore" });
  lines.push({ type: "explore" });

  return lines;
}

export function bootLineDelay(line: BootLine, index: number): number {
  if (index === 0) return 400;
  switch (line.type) {
    case "command":
      return 350;
    case "status":
      return line.muted ? 120 : 220;
    case "load":
      return 55;
    case "summary":
      return 400;
    default:
      return 150;
  }
}

/** Boot scroll phase (init + loads + summary) vs compact end state (explore). */
export function splitBootSequence(lines: BootLine[]) {
  const summaryIndex = lines.findIndex((l) => l.type === "summary");
  const summary = summaryIndex >= 0 ? lines[summaryIndex] : null;
  const bootLines = summaryIndex >= 0 ? lines.slice(0, summaryIndex + 1) : lines;
  return { bootLines, summary };
}
