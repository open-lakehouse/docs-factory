import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "../../lib/initials";

interface CommentBubbleProps {
  login?: string;
  /** Cached display name; falls back to the login when absent. */
  name?: string;
  body?: string;
  reply?: boolean;
  /** Nesting depth (0 = thread root). Drives left indentation for sub-threads. */
  depth?: number;
  /** When set, renders a small "Reply" affordance that targets this comment. */
  onReply?: () => void;
  /** Frozen git provenance — the commit sha this comment was authored against. */
  authoredGitSha?: string;
}

// A tombstoned/erased author has this login (see EraseUser). We drop the avatar
// + profile link for it since there is no GitHub identity behind it anymore.
const TOMBSTONE_LOGIN = "deleted-user";

// One indent step per nesting level, capped so deep threads don't march off the
// edge (the server caps depth too, but clamp defensively).
const INDENT_STEP_REM = 0.85;
const MAX_INDENT_LEVELS = 4;

export default function CommentBubble({
  login,
  name,
  body,
  reply,
  depth = 0,
  onReply,
  authoredGitSha,
}: CommentBubbleProps) {
  const indent = Math.min(depth, MAX_INDENT_LEVELS) * INDENT_STEP_REM;
  const attributed = login != null && login !== TOMBSTONE_LOGIN;
  const displayName = name || login;
  return (
    <div
      className={cn("review-comment", reply && "reply")}
      style={depth > 0 ? { marginLeft: `${indent}rem` } : undefined}
    >
      {login &&
        (attributed ? (
          <a
            className="review-author"
            href={`https://github.com/${login}`}
            target="_blank"
            rel="noreferrer"
          >
            <Avatar className="size-5">
              <AvatarImage src={`https://github.com/${login}.png?size=40`} alt="" />
              <AvatarFallback className="text-[0.6rem]">
                {initials(displayName ?? login)}
              </AvatarFallback>
            </Avatar>
            <span>{displayName}</span>
          </a>
        ) : (
          <span className="review-author">{displayName}</span>
        ))}
      {body && <p className="review-body">{body}</p>}
      {authoredGitSha && (
        <span className="review-provenance" title={`Authored against ${authoredGitSha}`}>
          on {authoredGitSha.slice(0, 7)}
        </span>
      )}
      {onReply && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0 text-muted-foreground"
          onClick={onReply}
        >
          Reply
        </Button>
      )}
    </div>
  );
}
