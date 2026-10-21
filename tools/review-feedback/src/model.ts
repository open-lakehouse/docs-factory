// Threads on the estate model (ContentArea.MODEL): an element (`element/<fqn>`),
// a view (`view/<id>`), or the whole model (`estate`). They have no page file;
// an agent fixes them in architecture/model's .likec4 sources, so each is
// located at the declaration it's about.
//
// A line scan, not a LikeC4 parse: an element is declared `<name> = <kind> …`
// (nested in its parent, or under `extend <parent>`) and a view `view <id>`,
// `dynamic view <id>`, or `deployment view <id>`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { create } from "@bufbuild/protobuf";
import {
  ContentArea,
  type ContentRef,
  ContentRefSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import type { Location } from "./locate.js";

export const MODEL_DIR = join("architecture", "model");

export type ModelTarget =
  | { kind: "element"; id: string }
  | { kind: "view"; id: string }
  | { kind: "estate" };

export function modelTarget(ref: ContentRef): ModelTarget | undefined {
  if (ref.area !== ContentArea.MODEL) return undefined;
  if (ref.slug === "estate") return { kind: "estate" };
  const m = /^(element|view)\/([\w.-]+)$/.exec(ref.slug);
  return m ? { kind: m[1] as "element" | "view", id: m[2] } : undefined;
}

export function modelRef(slug: string): ContentRef {
  return create(ContentRefSchema, { area: ContentArea.MODEL, slug });
}

function likec4Files(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return likec4Files(full);
    return name.endsWith(".likec4") ? [full] : [];
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Hit {
  path: string;
  line: number;
  text: string;
  source: string;
}

function scan(repoRoot: string, re: RegExp): Hit[] {
  return likec4Files(join(repoRoot, MODEL_DIR)).flatMap((abs) => {
    const source = readFileSync(abs, "utf8");
    return source
      .split("\n")
      .flatMap((text, i) =>
        re.test(text) ? [{ path: relative(repoRoot, abs), line: i + 1, text, source }] : [],
      );
  });
}

/** Where a model thread's target is declared, or the model folder for `estate`. */
export function locateModel(repoRoot: string, target: ModelTarget): Location | undefined {
  if (target.kind === "estate") {
    return { path: MODEL_DIR, precision: "file", drifted: false, note: "the model as a whole" };
  }
  let hits: Hit[];
  if (target.kind === "view") {
    hits = scan(
      repoRoot,
      new RegExp(`^\\s*(?:dynamic |deployment )?view\\s+${escapeRe(target.id)}\\b`),
    );
  } else {
    const parts = target.id.split(".");
    const name = parts[parts.length - 1];
    hits = scan(repoRoot, new RegExp(`^\\s*${escapeRe(name)}\\s*=\\s*\\w`));
    // A short name can repeat under other parents; prefer the file that
    // declares or extends this element's parent.
    const parent = parts.slice(0, -1).join(".");
    if (hits.length > 1 && parent) {
      const near = hits.filter((h) =>
        new RegExp(
          `(extend\\s+${escapeRe(parent)}\\b|^\\s*${escapeRe(parts[parts.length - 2])}\\s*=)`,
          "m",
        ).test(h.source),
      );
      if (near.length) hits = near;
    }
  }
  const hit = hits[0];
  if (!hit) return undefined;
  return {
    path: hit.path,
    startLine: hit.line,
    endLine: hit.line,
    excerpt: hit.text,
    precision: "section",
    drifted: false,
    note: hit.path.includes("/generated/")
      ? `${target.kind} ${target.id} is Trestle-generated: change envs/<name>/env.toml and run \`just env-render\`, never this file`
      : hits.length > 1
        ? `${target.kind} ${target.id}: ${hits.length} candidate declarations; this is the first`
        : `${target.kind} ${target.id} in the LikeC4 model; edit it with the update-architecture skill`,
  };
}
