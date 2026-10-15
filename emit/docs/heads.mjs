/**
 * A content page's `<head>` as a docs site emits it. The emitter writes it to the
 * site's heads.json, and the review app's Head tab shows the same object, so
 * both must build it here.
 */
import { pageHead } from "../../site/src/content-core/head.mjs";

/** `page` is `{ identity, meta, body }`, with `body` the raw markdown. */
export function docPageHead(site, { identity, meta, body }) {
  return pageHead({
    identity,
    meta,
    body,
    origin: site.origin,
    hrefFor: site.hrefFor,
    siteName: site.title,
  });
}
