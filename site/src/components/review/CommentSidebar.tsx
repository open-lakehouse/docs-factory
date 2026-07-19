// Per-section review comments for a rendered blog/doc page. Only mounts for
// allowlisted viewers. Discovers headings from the article the same way
// OnThisPage does (so anchors match the DOM + the version manifest), fetches
// threads via connect-query (useQuery(listComments)), and lets reviewers post,
// reply, and resolve — the in-app replacement for Google-Docs comments.
//
// Comments can be heading-level (post from a section's box) OR fine-grained: a
// prose text-quote or a code source anchor captured by the SelectionLayer. A
// fine-grained thread shows the quoted snippet and, for prose, highlights the
// range in the article. Threads whose section/quote/line was removed show in a
// separate "Orphaned" group, never lost.
import { useEffect, useState, type RefObject } from "react";
import { useQuery, useMutation } from "@connectrpc/connect-query";
import {
  listComments,
  createComment,
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef, Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { fingerprint } from "../../lib/content-ref";
import { useAuth } from "../../lib/auth-context";
import { useSelectionState, type PendingAnchor } from "./selection-context";
import QuoteHighlights from "./QuoteHighlights";

interface Heading {
  id: string;
  text: string;
}

export default function CommentSidebar({
  contentRef,
  articleRef,
}: {
  contentRef: ContentRef;
  articleRef: RefObject<HTMLElement | null>;
}) {
  const { isAllowlisted } = useAuth();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const { pending, setPending } = useSelectionState();

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const found: Heading[] = [];
    article.querySelectorAll("h1, h2, h3, h4").forEach((n) => {
      if (n.id) found.push({ id: n.id, text: n.textContent ?? "" });
    });
    setHeadings(found);
  }, [articleRef, isAllowlisted]);

  const { data, refetch } = useQuery(listComments, { ref: contentRef }, { enabled: isAllowlisted });

  if (!isAllowlisted) return null;

  const threadsByAnchor = new Map<string, Thread[]>();
  for (const t of data?.threads ?? []) {
    const a = t.root?.anchorSlug ?? "";
    (threadsByAnchor.get(a) ?? threadsByAnchor.set(a, []).get(a)!).push(t);
  }
  const orphaned = data?.orphanedThreads ?? [];

  return (
    <aside className="review-comments" aria-label="Review comments">
      <p className="toc-title">Review comments</p>
      <QuoteHighlights articleRef={articleRef} threads={data?.threads ?? []} />
      {pending && (
        <PendingComposer
          contentRef={contentRef}
          pending={pending}
          onDone={() => {
            setPending(null);
            void refetch();
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {headings.map((h) => (
        <SectionThreads
          key={h.id}
          heading={h}
          contentRef={contentRef}
          threads={threadsByAnchor.get(h.id) ?? []}
          onChange={refetch}
        />
      ))}
      {orphaned.length > 0 && (
        <div className="review-orphaned">
          <p className="toc-title">On removed/changed sections</p>
          {orphaned.map((t) => (
            <ThreadView key={t.root?.id} thread={t} onChange={refetch} />
          ))}
        </div>
      )}
    </aside>
  );
}

/** Composer shown when the SelectionLayer captured a prose/code selection. */
function PendingComposer({
  contentRef,
  pending,
  onDone,
  onCancel,
}: {
  contentRef: ContentRef;
  pending: PendingAnchor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useMutation(createComment);
  const [draft, setDraft] = useState("");

  async function post() {
    if (!draft.trim()) return;
    if (pending.kind === "prose") {
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
        selector: {
          quote: pending.selector.quote,
          prefix: pending.selector.prefix,
          suffix: pending.selector.suffix,
          start: pending.selector.start,
        },
      });
    } else {
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
        codeSelector: {
          path: pending.path,
          region: pending.region,
          line: pending.line,
          endLine: pending.endLine,
          lineHash: pending.lineHash,
          fileHash: pending.fileHash,
        },
      });
    }
    setDraft("");
    onDone();
  }

  const quote = pending.kind === "prose" ? pending.selector.quote : pending.quote;
  const label = pending.kind === "code" ? `${pending.path}:${pending.line}` : pending.headingText;

  return (
    <div className="review-composer">
      <div className="review-composer-target">
        <span className="review-composer-label">{label || "New comment"}</span>
        <blockquote className={`review-quote${pending.kind === "code" ? " code" : ""}`}>
          {quote}
        </blockquote>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Comment on this selection…"
        rows={3}
      />
      <div className="review-composer-actions">
        <button onClick={post} disabled={create.isPending || !draft.trim()}>
          Comment
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SectionThreads({
  heading,
  contentRef,
  threads,
  onChange,
}: {
  heading: Heading;
  contentRef: ContentRef;
  threads: Thread[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const create = useMutation(createComment);
  const [draft, setDraft] = useState("");

  async function post() {
    if (!draft.trim()) return;
    await create.mutateAsync({
      ref: contentRef,
      anchorSlug: heading.id,
      anchorFingerprint: fingerprint(heading.text),
      bodyMd: draft,
    });
    setDraft("");
    onChange();
  }

  return (
    <div className="review-section">
      <button className="review-section-head" onClick={() => setOpen((o) => !o)}>
        <a href={`#${heading.id}`} onClick={(e) => e.stopPropagation()}>
          {heading.text}
        </a>
        {threads.length > 0 && <span className="review-count">{threads.length}</span>}
      </button>
      {open && (
        <div className="review-section-body">
          {threads.map((t) => (
            <ThreadView key={t.root?.id} thread={t} onChange={onChange} />
          ))}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Comment on this section…"
            rows={2}
          />
          <button onClick={post} disabled={create.isPending || !draft.trim()}>
            Comment
          </button>
        </div>
      )}
    </div>
  );
}

function ThreadView({ thread, onChange }: { thread: Thread; onChange: () => void }) {
  const contentRef = thread.root?.ref;
  const reply = useMutation(createComment);
  const resolve = useMutation(resolveThread);
  const unresolve = useMutation(unresolveThread);
  const [text, setText] = useState("");

  async function postReply() {
    if (!text.trim() || !contentRef || !thread.root) return;
    await reply.mutateAsync({
      ref: contentRef,
      anchorSlug: thread.root.anchorSlug,
      anchorFingerprint: thread.root.anchorFingerprint,
      parentId: thread.root.id,
      bodyMd: text,
    });
    setText("");
    onChange();
  }

  async function toggleResolved() {
    const id = thread.root?.id;
    if (!id) return;
    if (thread.resolved) await unresolve.mutateAsync({ threadRootId: id });
    else await resolve.mutateAsync({ threadRootId: id });
    onChange();
  }

  // A fine-grained thread shows its target above the comment: the quoted prose
  // for a text selector, or the source location for a code selector.
  const sel = thread.root?.selector;
  const code = thread.root?.codeSelector;
  const codeLabel = code
    ? `${code.path}:${code.line}${code.endLine > code.line ? `-${code.endLine}` : ""}`
    : undefined;

  return (
    <div className={`review-thread${thread.resolved ? " resolved" : ""}`}>
      {sel?.quote && <blockquote className="review-quote">{sel.quote}</blockquote>}
      {code && (
        <blockquote className="review-quote code">
          <span className="review-quote-src">{codeLabel}</span>
        </blockquote>
      )}
      <Comment login={thread.root?.authorLogin} body={thread.root?.bodyMd} />
      {thread.replies.map((r) => (
        <Comment key={r.id} login={r.authorLogin} body={r.bodyMd} reply />
      ))}
      <div className="review-thread-actions">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply…"
        />
        <button onClick={postReply} disabled={reply.isPending || !text.trim()}>
          Reply
        </button>
        <button onClick={toggleResolved}>
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

function Comment({
  login,
  body,
  reply,
}: {
  login?: string;
  body?: string;
  reply?: boolean;
}) {
  return (
    <div className={`review-comment${reply ? " reply" : ""}`}>
      <span className="review-author">{login}</span>
      <span className="review-body">{body}</span>
    </div>
  );
}
