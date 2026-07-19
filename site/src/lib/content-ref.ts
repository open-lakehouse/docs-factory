// Build the proto ContentRef the review API expects from a rendered page's
// identity, and compute a heading's fingerprint the same way the version
// manifest does (lowercased, whitespace-collapsed) so client-created comments
// re-anchor consistently.
import {
  ContentArea,
  type ContentRef,
} from "../gen/docs_factory/review/v1/messages_pb";
import { create } from "@bufbuild/protobuf";
import { ContentRefSchema } from "../gen/docs_factory/review/v1/messages_pb";

export function blogRef(slug: string): ContentRef {
  return create(ContentRefSchema, { area: ContentArea.BLOGS, slug });
}

export function docRef(project: string, bucket: string, slug: string): ContentRef {
  return create(ContentRefSchema, {
    area: ContentArea.DOCS,
    slug,
    project,
    bucket,
  });
}

/** Match build-version-manifest.mjs: lowercase + collapse whitespace. */
export function fingerprint(headingText: string): string {
  return headingText.trim().toLowerCase().replace(/\s+/g, " ");
}
