/**
 * The site's permanent redirects live in its hand-maintained vercel.json, which
 * sync mirrors upstream as-is. The emitter only checks them: a destination must
 * be something this emit serves, so a page that is renamed or drops back to
 * draft can't leave a legacy URL redirecting to a 404.
 */

/**
 * Every redirect in `config` whose destination this emit doesn't serve.
 * `anchors` maps each page route to its heading ids; `files` is the emit's
 * output map, for destinations that are files (`/env/<dir>.tar.gz`).
 */
export function redirectErrors(config, { anchors, files }) {
  const errors = [];
  for (const { source, destination } of config?.redirects ?? []) {
    // External destinations are the reader's problem to keep alive, not the emit's.
    if (/^https?:\/\//.test(destination)) continue;
    const [route, anchor] = destination.split("#");
    const ids = anchors.get(route);
    if (ids) {
      if (anchor && !ids.has(anchor)) {
        errors.push(`${source} → ${destination}: ${route} has no heading #${anchor}`);
      }
    } else if (!files.has(`public${route}`)) {
      errors.push(`${source} → ${destination}: not a route this emit serves`);
    }
  }
  return errors;
}
