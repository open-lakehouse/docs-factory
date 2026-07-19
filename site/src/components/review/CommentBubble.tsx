interface CommentBubbleProps {
  login?: string;
  body?: string;
  reply?: boolean;
  /** Nesting depth (0 = thread root). Drives left indentation for sub-threads. */
  depth?: number;
  /** When set, renders a small "Reply" affordance that targets this comment. */
  onReply?: () => void;
  /** Frozen git provenance — the commit sha this comment was authored against. */
  authoredGitSha?: string;
}

// One indent step per nesting level, capped so deep threads don't march off the
// edge (the server caps depth too, but clamp defensively).
const INDENT_STEP_REM = 0.85;
const MAX_INDENT_LEVELS = 4;

export default function CommentBubble({
  login,
  body,
  reply,
  depth = 0,
  onReply,
  authoredGitSha,
}: CommentBubbleProps) {
  const indent = Math.min(depth, MAX_INDENT_LEVELS) * INDENT_STEP_REM;
  return (
    <div
      className={`review-comment${reply ? " reply" : ""}`}
      style={depth > 0 ? { marginLeft: `${indent}rem` } : undefined}
    >
      {login && <span className="review-author">{login}</span>}
      {body && <p className="review-body">{body}</p>}
      {authoredGitSha && (
        <span className="review-provenance" title={`Authored against ${authoredGitSha}`}>
          on {authoredGitSha.slice(0, 7)}
        </span>
      )}
      {onReply && (
        <button type="button" className="review-reply-link" onClick={onReply}>
          Reply
        </button>
      )}
    </div>
  );
}
