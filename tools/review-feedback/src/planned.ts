// The nav.yml `planned:` slots in a checkout. Reviewers leave instructions for
// a slot as threads on its synthetic ref (content-core plannedSlug); listing
// them needs the slots themselves, which only the checkout knows.
//
// A line scan, not a YAML parse: a planned entry is always a `- planned: <id>`
// item with its `title:` among the keys under it (content-core nav.mjs), and
// the scan yields the entry's line for the agent at no extra cost.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { PLANNED_BUCKET, plannedSlug } from "../../../site/src/content-core/identity.mjs";
import {
  ContentArea,
  type ContentRef,
  ContentRefSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";

export interface PlannedSlot {
  project: string;
  id: string;
  title: string;
  /** Repo-relative nav.yml path. */
  path: string;
  /** 1-based line of the `- planned:` entry. */
  line: number;
}

const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2");

/** Every planned slot in one nav.yml's text. */
export function scanPlanned(project: string, path: string, text: string): PlannedSlot[] {
  const lines = text.split("\n");
  const out: PlannedSlot[] = [];
  lines.forEach((raw, i) => {
    const m = /^(\s*)-\s+planned:\s*(\S.*?)\s*(#.*)?$/.exec(raw);
    if (!m) return;
    const id = unquote(m[2]);
    let title = id;
    for (const next of lines.slice(i + 1)) {
      if (/^\s*-\s/.test(next) || !next.trim()) break;
      const t = /^\s+title:\s*(.+)$/.exec(next);
      if (t) {
        title = unquote(t[1]);
        break;
      }
    }
    out.push({ project, id, title, path, line: i + 1 });
  });
  return out;
}

/** Planned slots across every `content/<project>/nav.yml` in the checkout. */
export function plannedSlots(repoRoot: string): PlannedSlot[] {
  const contentRoot = join(repoRoot, "content");
  if (!existsSync(contentRoot)) return [];
  return readdirSync(contentRoot).flatMap((project) => {
    const rel = `content/${project}/nav.yml`;
    const abs = join(repoRoot, rel);
    return existsSync(abs) ? scanPlanned(project, rel, readFileSync(abs, "utf8")) : [];
  });
}

export function plannedSlotRef(slot: Pick<PlannedSlot, "project" | "id">): ContentRef {
  return create(ContentRefSchema, {
    area: ContentArea.DOCS,
    project: slot.project,
    bucket: PLANNED_BUCKET,
    slug: plannedSlug(slot.project, slot.id),
  });
}
