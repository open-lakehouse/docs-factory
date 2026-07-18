import { Globe } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { getAuthors, type Author, type AuthorLinks } from "../authors";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* lucide-react ships no brand marks, so inline the three we need. */
const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.48 3.24H4.29L17.61 20.65z" />
  </svg>
);

const SOCIALS: {
  key: keyof AuthorLinks;
  label: string;
  Icon: () => React.ReactElement;
}[] = [
  { key: "linkedin", label: "LinkedIn", Icon: LinkedInIcon },
  { key: "github", label: "GitHub", Icon: GitHubIcon },
  { key: "x", label: "X", Icon: XIcon },
  { key: "website", label: "Website", Icon: () => <Globe size={15} aria-hidden="true" /> },
];

function AuthorAvatar({ author, className }: { author: Author; className?: string }) {
  return (
    <Avatar className={className}>
      {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt={author.name} />}
      <AvatarFallback>{initials(author.name)}</AvatarFallback>
    </Avatar>
  );
}

function SocialLinks({ author }: { author: Author }) {
  const links = SOCIALS.filter((s) => author.links[s.key]);
  if (links.length === 0) return null;
  return (
    <div className="author-card-socials">
      {links.map(({ key, label, Icon }) => (
        <a
          key={key}
          href={author.links[key]}
          target="_blank"
          rel="noopener noreferrer"
          className="author-social-link"
          title={`${author.name} on ${label}`}
          aria-label={`${author.name} on ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon />
        </a>
      ))}
    </div>
  );
}

function AuthorCard({ author }: { author: Author }) {
  return (
    <div className="author-card">
      <AuthorAvatar author={author} className="author-card-avatar" />
      <div className="author-card-body">
        <p className="author-card-name">{author.name}</p>
        {(author.role || author.org) && (
          <p className="author-card-role">
            {[author.role, author.org].filter(Boolean).join(" · ")}
          </p>
        )}
        <SocialLinks author={author} />
      </div>
    </div>
  );
}

/** A single byline token: avatar + name, revealing a rich card on hover. */
function AuthorChip({ author }: { author: Author }) {
  if (!author.known) return <span className="author-chip-name">{author.name}</span>;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className="author-chip"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
        >
          <AuthorAvatar author={author} className="author-chip-avatar" />
          <span className="author-chip-name">{author.name}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="author-hovercard">
        <AuthorCard author={author} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Renders a blog byline as interactive author chips. Accepts the raw
 * frontmatter `author` string (one or several names); unknown names degrade to
 * plain text.
 */
export default function AuthorBadge({ byline }: { byline?: string }) {
  const authors = getAuthors(byline);
  if (authors.length === 0) return <>—</>;
  return (
    <span className="author-badge">
      {authors.map((author, i) => (
        <span key={author.id} className="author-badge-item">
          <AuthorChip author={author} />
          {i < authors.length - 1 && <span className="author-badge-sep">, </span>}
        </span>
      ))}
    </span>
  );
}

export { AuthorCard };
