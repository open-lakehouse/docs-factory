/** A /plan page URL; `path` is the section path relative to /plan. */
export function planHref(path: string, params?: Record<string, string>): string {
  const base = path ? `/plan/${path}` : "/plan";
  const search = params ? new URLSearchParams(params).toString() : "";
  return search ? `${base}?${search}` : base;
}
