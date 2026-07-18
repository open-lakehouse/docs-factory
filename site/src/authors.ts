// authors.ts — resolve blog bylines to rich author profiles.
//
// Source of truth is blogs/authors.yml (see that file's header). Posts carry a
// plain `author: <Full Name>` string; here we look it up (by name or id) and
// attach role, org, avatar, and social links so the UI can render an
// interactive author card. Unknown bylines resolve to a name-only profile so
// the preview always degrades gracefully.
import yaml from "js-yaml";
import authorsRaw from "../../blogs/authors.yml?raw";

export interface AuthorLinks {
  linkedin?: string;
  github?: string;
  x?: string;
  website?: string;
}

export interface Author {
  id: string;
  name: string;
  role?: string;
  org?: string;
  avatarUrl?: string;
  links: AuthorLinks;
  /** True when the byline matched a registry entry (vs. a name-only fallback). */
  known: boolean;
}

interface RawAuthor {
  name: string;
  role?: string;
  org?: string;
  avatar?: string;
  links?: AuthorLinks;
}

const avatarUrls = import.meta.glob("../../blogs/authors/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function avatarUrlFor(filename?: string): string | undefined {
  if (!filename) return undefined;
  const entry = Object.entries(avatarUrls).find(([path]) => path.endsWith(`/${filename}`));
  return entry?.[1];
}

const normalize = (s: string) => s.trim().toLowerCase();

const registry: Author[] = Object.entries(
  (yaml.load(authorsRaw) as Record<string, RawAuthor>) ?? {},
).map(([id, raw]) => ({
  id,
  name: raw.name,
  role: raw.role,
  org: raw.org,
  avatarUrl: avatarUrlFor(raw.avatar),
  links: raw.links ?? {},
  known: true,
}));

const byId = new Map(registry.map((a) => [a.id, a]));
const byName = new Map(registry.map((a) => [normalize(a.name), a]));

/** Resolve a single byline token (a name or an id) to an Author. */
export function getAuthor(nameOrId: string): Author {
  const key = nameOrId.trim();
  const found = byName.get(normalize(key)) ?? byId.get(key);
  if (found) return found;
  return { id: normalize(key).replace(/\s+/g, "-"), name: key, links: {}, known: false };
}

/** Split a frontmatter `author` string ("A", "A & B", "A, B and C") into authors. */
export function getAuthors(byline?: string): Author[] {
  if (!byline) return [];
  return byline
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(getAuthor);
}
