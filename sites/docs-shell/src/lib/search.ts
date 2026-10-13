// Full-text search over the emitter's public/search-index.json: one record
// per page section, fetched and indexed the first time it's needed.
import MiniSearch from "minisearch";

export interface SearchRecord {
  id: string;
  route: string;
  /** Heading id on the page, or null for the text above the first heading. */
  anchor: string | null;
  page: string;
  heading: string | null;
  section: string[];
  text: string;
}

export interface SearchHit extends SearchRecord {
  /** The document terms the query matched (prefix and fuzzy expansions included). */
  terms: string[];
}

export interface PageHits {
  route: string;
  page: string;
  section: string[];
  hits: SearchHit[];
}

type Index = { search: MiniSearch<SearchRecord>; byId: Map<string, SearchRecord> };

let pending: Promise<Index> | null = null;

export function loadIndex(): Promise<Index> {
  pending ??= fetch("/search-index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`search index: ${res.status}`);
      return res.json() as Promise<{ records: SearchRecord[] }>;
    })
    .then(({ records }) => {
      const search = new MiniSearch<SearchRecord>({
        fields: ["page", "heading", "text"],
        extractField: (doc, field) =>
          (doc as unknown as Record<string, string | null>)[field] ?? "",
        searchOptions: {
          boost: { page: 3, heading: 2 },
          prefix: true,
          fuzzy: 0.2,
          combineWith: "AND",
        },
      });
      search.addAll(records);
      return { search, byId: new Map(records.map((r) => [r.id, r])) };
    })
    .catch((err) => {
      // Let the next open retry instead of caching the failure.
      pending = null;
      throw err;
    });
  return pending;
}

/** Hits grouped by page, best page first, at most `perPage` sections each. */
export function searchDocs({ search, byId }: Index, query: string, limit = 8, perPage = 3) {
  const groups = new Map<string, PageHits>();
  for (const result of search.search(query)) {
    const record = byId.get(String(result.id));
    if (!record) continue;
    let group = groups.get(record.route);
    if (!group) {
      if (groups.size === limit) continue;
      group = { route: record.route, page: record.page, section: record.section, hits: [] };
      groups.set(record.route, group);
    }
    if (group.hits.length < perPage) group.hits.push({ ...record, terms: result.terms });
  }
  return [...groups.values()];
}

export interface Segment {
  text: string;
  mark: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A window of `text` around the first matched term, split for highlighting. */
export function excerpt(text: string, terms: string[], width = 140): Segment[] {
  if (!text) return [];
  const words = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  const re = words.length ? new RegExp(words.map(escapeRegExp).join("|"), "gi") : null;
  const first = re ? text.search(re) : -1;
  let start = Math.max(0, first - 40);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  let end = Math.min(text.length, start + width);
  const lastSpace = text.lastIndexOf(" ", end);
  if (end < text.length && lastSpace > start) end = lastSpace;
  const slice = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  if (!re) return [{ text: slice, mark: false }];

  const out: Segment[] = [];
  let at = 0;
  for (const m of slice.matchAll(re)) {
    if (m.index > at) out.push({ text: slice.slice(at, m.index), mark: false });
    out.push({ text: m[0], mark: true });
    at = m.index + m[0].length;
  }
  if (at < slice.length) out.push({ text: slice.slice(at), mark: false });
  return out;
}
