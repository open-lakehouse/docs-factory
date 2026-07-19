// Mapping helpers between proto enums/messages and the DB's text columns.
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { create } from "@bufbuild/protobuf";
import {
  ContentArea,
  ContentVersionSchema,
  type ContentRef,
  type ContentVersion,
} from "./gen/docs_factory/review/v1/messages_pb.js";

/** proto ContentArea → the `area` text column ('blogs' | 'docs'). */
export function areaToDb(area: ContentArea): "blogs" | "docs" {
  switch (area) {
    case ContentArea.BLOGS:
      return "blogs";
    case ContentArea.DOCS:
      return "docs";
    default:
      throw new Error(`unsupported content area: ${area}`);
  }
}

/** `area` text column → proto ContentArea. */
export function areaFromDb(area: string): ContentArea {
  return area === "docs" ? ContentArea.DOCS : ContentArea.BLOGS;
}

/** A DB content_version row shape (snake_case columns). */
export interface ContentVersionRow {
  id: number | string;
  area: string;
  slug: string;
  project: string | null;
  bucket: string | null;
  content_hash: string;
  git_sha: string;
  title: string | null;
  frontmatter_status: string | null;
  created_at: Date;
}

/** Build the proto ContentVersion message from a DB row + its ref. */
export function contentVersionFromRow(row: ContentVersionRow, ref: ContentRef): ContentVersion {
  return create(ContentVersionSchema, {
    id: String(row.id),
    ref,
    contentHash: row.content_hash,
    gitSha: row.git_sha,
    title: row.title ?? "",
    frontmatterStatus: row.frontmatter_status ?? "",
    createdAt: timestampFromDate(row.created_at),
  });
}
