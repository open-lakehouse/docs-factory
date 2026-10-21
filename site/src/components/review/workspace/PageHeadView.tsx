// The emitted `<head>` view: what a docs site writes into the page's static HTML
// for crawlers and agents (src/lib/page-heads.ts). READ-ONLY for the same reason
// as the `.md` twin: comments anchor on the ContentRef with no view
// discriminator. A header toggle flips between:
//   - JSON-LD: the schema.org object, exactly as serialized into
//     `<script type="application/ld+json">` (pretty-printed here).
//   - Meta: title, description, canonical, twin, OpenGraph and Twitter tags.

import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { modelHref } from "../../../lib/content-ref";
import { type PageHeadEntry, pageHeadKey, usePageHeads } from "../../../lib/page-heads";
import CodeCopyButton from "../../CodeCopyButton";

type Mode = "json-ld" | "meta";
const MODES: { mode: Mode; label: string }[] = [
  { mode: "json-ld", label: "JSON-LD" },
  { mode: "meta", label: "Meta" },
];

export default function PageHeadView({ contentRef }: { contentRef: ContentRef }) {
  const [mode, setMode] = useState<Mode>("json-ld");
  const { heads, isLoading } = usePageHeads();
  const entry =
    heads[pageHeadKey(contentRef.project ?? "", contentRef.bucket ?? "", contentRef.slug)];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">
          {entry?.head.canonical ?? ""}
        </span>
        <div role="radiogroup" aria-label="Head display" className="flex items-center gap-1">
          {MODES.map(({ mode: m, label }) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  on
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-6 text-muted-foreground">Loading page head…</p>}
        {!isLoading && !entry && (
          <p className="p-6 text-muted-foreground">
            No page head — this page isn't emitted to a docs site.
          </p>
        )}
        {entry && (
          <div className="prose mx-auto max-w-3xl px-6 py-8">
            {!entry.published && (
              <p className="muted text-sm">
                As a <code>--drafts</code> preview of {entry.site} emits it; the page ships with
                this head once it is <code>status: ready</code>.
              </p>
            )}
            {mode === "json-ld" ? <JsonLd entry={entry} /> : <Meta entry={entry} />}
          </div>
        )}
      </div>
    </div>
  );
}

// A term's `@id` is `<origin>/concepts.json#<element id>` (content-core head.mjs).
const CONCEPT_ID_RE = /"@id": "[^"]*\/concepts\.json#([\w.-]+)"/g;

function JsonLd({ entry }: { entry: PageHeadEntry }) {
  const json = JSON.stringify(entry.head.jsonLd, null, 2);
  const concepts = [...new Set([...json.matchAll(CONCEPT_ID_RE)].map((m) => m[1]))];
  return (
    <>
      {concepts.length > 0 && (
        <p className="text-sm">
          Concepts:{" "}
          {concepts.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link to={modelHref({ kind: "element", id })}>
                <code>{id}</code>
              </Link>
            </span>
          ))}
        </p>
      )}
      <JsonLdBlock json={json} />
    </>
  );
}

function JsonLdBlock({ json }: { json: string }) {
  return (
    <div className="cb" data-has-filename="true">
      <div className="cb-head">
        <span className="cb-file">application/ld+json</span>
      </div>
      <CodeCopyButton code={json} />
      <pre className="cb-pre">
        <code>{json}</code>
      </pre>
    </div>
  );
}

function Meta({ entry }: { entry: PageHeadEntry }) {
  const { head } = entry;
  const rows: [string, string | null][] = [
    ["title", head.title],
    [
      `description (from ${entry.descriptionSource === "summary" ? "summary" : "first paragraph"})`,
      head.description,
    ],
    ["canonical", head.canonical],
    ["alternate text/markdown", head.twin],
    ...head.og,
    ...head.twitter,
  ];
  return (
    <table>
      <tbody>
        {rows.map(([name, value]) => (
          <tr key={name}>
            <th scope="row" className="whitespace-nowrap font-mono text-xs">
              {name}
            </th>
            <td className="break-words">{value || <span className="muted">(none)</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
