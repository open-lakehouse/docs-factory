// A project's docs roadmap: its nav.yml sections with every slot's progress —
// pages by git status, `planned:` slots, and open content requests filed under
// the section. Free of the build-time content globs so it runs under bun.
import type { NavNode } from "../../doc-nav";

export type SlotStage = "ready" | "draft" | "planned" | "requested";

export type RoadmapSlot =
  | {
      kind: "page";
      stage: "ready" | "draft";
      /** Set for another project's page cross-published here. */
      project?: string;
      bucket: string;
      slug: string;
      label: string;
      /** Backlog id (`id:` in nav.yml). */
      id?: string;
      status?: string;
      /** False for a secondary placement of a page listed elsewhere. */
      primary: boolean;
    }
  | { kind: "planned"; stage: "planned"; id: string; title: string; request?: string }
  | { kind: "requested"; stage: "requested"; requestId: string; title: string };

export type StageCounts = Record<SlotStage, number>;

export interface RoadmapSection {
  label: string;
  /** `A › B`: the placement content requests use for this section. */
  placement: string;
  slots: RoadmapSlot[];
  sections: RoadmapSection[];
  /**
   * Over this section and every section beneath it. Secondary placements,
   * `private` pages (never released), and other projects' cross-published pages
   * (their own roadmap counts them) are left out.
   */
  counts: StageCounts;
}

/** The subset of a ContentRequest the roadmap reads. */
export interface RoadmapRequest {
  id: string;
  title: string;
  placement: string;
}

export const PLACEMENT_SEPARATOR = " › ";

export function emptyCounts(): StageCounts {
  return { ready: 0, draft: 0, planned: 0, requested: 0 };
}

export function addCounts(into: StageCounts, from: StageCounts): StageCounts {
  for (const k of Object.keys(into) as SlotStage[]) into[k] += from[k];
  return into;
}

/** Shipped share: ready over everything the section plans to hold. */
export function progress(c: StageCounts): number {
  const total = c.ready + c.draft + c.planned + c.requested;
  return total === 0 ? 0 : c.ready / total;
}

/**
 * Build the roadmap tree. `requests` are the project's open page requests; a
 * request already promoted to a planned slot (its `request:` id) is not listed
 * twice. Top-level pages outside any section land on the returned root, and so
 * do requests whose section no longer exists (renamed or removed).
 */
export function buildRoadmap(
  nodes: NavNode[],
  /** `project` is set for another project's cross-published page. */
  statusOf: (bucket: string, slug: string, project?: string) => string | undefined,
  requests: RoadmapRequest[],
): RoadmapSection {
  const promoted = new Set<string>();
  const collect = (ns: NavNode[]) => {
    for (const n of ns) {
      if (n.kind === "planned" && n.request) promoted.add(n.request);
      if (n.kind === "section") collect(n.children);
    }
  };
  collect(nodes);
  const byPlacement = new Map<string, RoadmapRequest[]>();
  for (const r of requests) {
    if (promoted.has(r.id)) continue;
    byPlacement.set(r.placement, [...(byPlacement.get(r.placement) ?? []), r]);
  }

  const build = (label: string, trail: string[], children: NavNode[]): RoadmapSection => {
    const placement = trail.join(PLACEMENT_SEPARATOR);
    const section: RoadmapSection = {
      label,
      placement,
      slots: [],
      sections: [],
      counts: emptyCounts(),
    };
    for (const n of children) {
      if (n.kind === "section") {
        const child = build(n.label, [...trail, n.label], n.children);
        section.sections.push(child);
        addCounts(section.counts, child.counts);
      } else if (n.kind === "planned") {
        section.slots.push({
          kind: "planned",
          stage: "planned",
          id: n.id,
          title: n.title,
          ...(n.request ? { request: n.request } : {}),
        });
        section.counts.planned++;
      } else {
        const status = statusOf(n.bucket, n.slug, n.project);
        const stage = status === "ready" ? "ready" : "draft";
        section.slots.push({
          kind: "page",
          stage,
          ...(n.project ? { project: n.project } : {}),
          bucket: n.bucket,
          slug: n.slug,
          label: n.label,
          ...(n.id ? { id: n.id } : {}),
          ...(status ? { status } : {}),
          primary: n.primary,
        });
        if (n.primary && !n.project && status !== "private") section.counts[stage]++;
      }
    }
    for (const r of byPlacement.get(placement) ?? []) {
      section.slots.push({
        kind: "requested",
        stage: "requested",
        requestId: r.id,
        title: r.title,
      });
      section.counts.requested++;
    }
    byPlacement.delete(placement);
    return section;
  };

  const root = build("", [], nodes);
  for (const r of [...byPlacement.values()].flat()) {
    root.slots.push({ kind: "requested", stage: "requested", requestId: r.id, title: r.title });
    root.counts.requested++;
  }
  return root;
}

/** Stable fragment id for a section, so requests and summary tiles can link to it. */
export function sectionAnchor(placement: string): string {
  return `section-${placement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
