// Mapping helpers between proto enums/messages and the DB's text columns.

import { create } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  ContentArea,
  type ContentRef,
  type ContentVersion,
  ContentVersionSchema,
  type MerkleNode,
  MerkleNodeSchema,
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
  id: string; // uuid
  area: string;
  slug: string;
  project: string | null;
  bucket: string | null;
  content_hash: string;
  git_sha: string;
  title: string | null;
  frontmatter_status: string | null;
  // Merkle root hash + jsonb tree + topics. Optional on the row type because
  // some read paths (draft summaries) build a partial row without them; the
  // mapper treats absence as empty.
  root_hash?: string | null;
  merkle_tree?: MerkleNodeJson | null;
  topics?: string[] | null;
  created_at: Date;
}

/**
 * The plain-object shape of a MerkleNode as stored in the merkle_tree jsonb.
 * The index signature keeps it assignable to postgres.js's JSONValue for writes.
 */
export interface MerkleNodeJson {
  key: string;
  kind: string;
  nodeHash: string;
  subtreeHash: string;
  level: number;
  label: string;
  children: MerkleNodeJson[];
  anchorSlug?: string;
  snippetPath?: string;
  snippetRegion?: string;
  [prop: string]: string | number | MerkleNodeJson[] | undefined;
}

/** Recursively build a proto MerkleNode from the stored jsonb plain object. */
export function merkleNodeToProto(n: MerkleNodeJson): MerkleNode {
  return create(MerkleNodeSchema, {
    key: n.key,
    kind: n.kind,
    nodeHash: n.nodeHash,
    subtreeHash: n.subtreeHash,
    level: n.level,
    label: n.label,
    children: (n.children ?? []).map(merkleNodeToProto),
    anchorSlug: n.anchorSlug,
    snippetPath: n.snippetPath,
    snippetRegion: n.snippetRegion,
  });
}

/** Recursively flatten a proto MerkleNode to the plain object stored as jsonb. */
export function merkleNodeToJson(n: MerkleNode): MerkleNodeJson {
  return {
    key: n.key,
    kind: n.kind,
    nodeHash: n.nodeHash,
    subtreeHash: n.subtreeHash,
    level: n.level,
    label: n.label,
    children: (n.children ?? []).map(merkleNodeToJson),
    ...(n.anchorSlug !== undefined ? { anchorSlug: n.anchorSlug } : {}),
    ...(n.snippetPath !== undefined ? { snippetPath: n.snippetPath } : {}),
    ...(n.snippetRegion !== undefined ? { snippetRegion: n.snippetRegion } : {}),
  };
}

/**
 * Interpret a date-only column as UTC midnight and build a wire Timestamp.
 * postgres.js returns a `date` column as either 'YYYY-MM-DD' or a Date the
 * driver localized to local midnight; either way we take just the calendar
 * date and pin it to UTC midnight, so the value lands on the intended day
 * regardless of the server's timezone. Writers store the UTC calendar date
 * (see setTargetReleaseDate), so reads must interpret it as UTC to round-trip.
 */
export function dateOnlyToUtcTimestamp(value: Date | string): Timestamp {
  const ymd = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return timestampFromDate(new Date(`${ymd}T00:00:00.000Z`));
}

/**
 * Build the proto ContentVersion message from a DB row + its ref. Includes the
 * Merkle tree only when the row was selected with `merkle_tree` (list responses
 * omit it for bandwidth; GetVersionTree / ProductChanges select it).
 */
export function contentVersionFromRow(row: ContentVersionRow, ref: ContentRef): ContentVersion {
  return create(ContentVersionSchema, {
    id: row.id,
    ref,
    contentHash: row.content_hash,
    gitSha: row.git_sha,
    title: row.title ?? "",
    frontmatterStatus: row.frontmatter_status ?? "",
    rootHash: row.root_hash ?? "",
    topics: row.topics ?? [],
    tree: row.merkle_tree ? merkleNodeToProto(row.merkle_tree) : undefined,
    createdAt: timestampFromDate(row.created_at),
  });
}
