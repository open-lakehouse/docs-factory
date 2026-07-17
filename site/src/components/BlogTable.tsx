import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, FileText, Layers } from "lucide-react";
import type { BlogSeriesGroup, ContentPage } from "../content";

interface BlogTableProps {
  series: BlogSeriesGroup[];
  standalone: ContentPage[];
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-list">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
    </div>
  );
}

function latestDate(posts: ContentPage[]): string | undefined {
  return posts
    .map((p) => p.frontmatter.date)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => b.localeCompare(a))[0];
}

/** Expanded detail for a single standalone post: summary + metadata grid. */
function PostDetail({ post }: { post: ContentPage }) {
  const fm = post.frontmatter;
  return (
    <div className="blog-detail">
      {fm.summary && <p className="blog-detail-summary">{fm.summary}</p>}
      <dl className="blog-meta-grid">
        {fm.author && (
          <div className="blog-meta">
            <dt>Author</dt>
            <dd>{fm.author}</dd>
          </div>
        )}
        {fm.date && (
          <div className="blog-meta">
            <dt>Date</dt>
            <dd className="mono">{fm.date}</dd>
          </div>
        )}
        {fm.status && (
          <div className="blog-meta">
            <dt>Status</dt>
            <dd className="mono">{fm.status}</dd>
          </div>
        )}
        {fm.target && (
          <div className="blog-meta">
            <dt>Target</dt>
            <dd className="mono">{fm.target}</dd>
          </div>
        )}
        {fm.tags && fm.tags.length > 0 && (
          <div className="blog-meta blog-meta-wide">
            <dt>Tags</dt>
            <dd>
              <Tags tags={fm.tags} />
            </dd>
          </div>
        )}
      </dl>
      <Link to={post.href} className="blog-detail-cta">
        Read post →
      </Link>
    </div>
  );
}

/** Expanded detail for a series: its posts listed richly in reading order. */
function SeriesDetail({ posts }: { posts: ContentPage[] }) {
  return (
    <ol className="blog-series-posts">
      {posts.map((post, i) => {
        const fm = post.frontmatter;
        return (
          <li key={post.href} className="blog-series-post">
            <span className="blog-series-post-index">
              {(fm.series_order ?? i + 1).toString().padStart(2, "0")}
            </span>
            <div className="blog-series-post-body">
              <Link to={post.href} className="blog-series-post-title">
                {fm.title ?? post.slug}
              </Link>
              <div className="blog-series-post-meta">
                {fm.date && <span className="mono">{fm.date}</span>}
                {fm.status && (
                  <span className="blog-post-status">{fm.status}</span>
                )}
              </div>
              {fm.summary && (
                <p className="blog-series-post-summary">{fm.summary}</p>
              )}
              <Tags tags={fm.tags ?? []} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function BlogTable({ series, standalone }: BlogTableProps) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="blog-table-wrap">
      <table className="blog-table">
        <thead>
          <tr>
            <th className="blog-th-chevron" aria-hidden="true" />
            <th>Title</th>
            <th className="blog-th-author">Author</th>
            <th className="blog-th-date">Date</th>
            <th className="blog-th-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {series.map((group) => {
            const id = `series:${group.series}`;
            const isOpen = open === id;
            return (
              <BlogRow
                key={id}
                isOpen={isOpen}
                onToggle={() => toggle(id)}
                icon={<Layers className="blog-row-icon" aria-hidden="true" />}
                title={group.series}
                titleBadge={`${group.posts.length} posts`}
                author="—"
                date={latestDate(group.posts)}
                status="series"
                detail={<SeriesDetail posts={group.posts} />}
              />
            );
          })}
          {standalone.map((post) => {
            const id = `post:${post.slug}`;
            const isOpen = open === id;
            const fm = post.frontmatter;
            return (
              <BlogRow
                key={id}
                isOpen={isOpen}
                onToggle={() => toggle(id)}
                icon={<FileText className="blog-row-icon" aria-hidden="true" />}
                title={fm.title ?? post.slug}
                titleHref={post.href}
                author={fm.author ?? "—"}
                date={fm.date}
                status={fm.status}
                detail={<PostDetail post={post} />}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BlogRow({
  isOpen,
  onToggle,
  icon,
  title,
  titleHref,
  titleBadge,
  author,
  date,
  status,
  detail,
}: {
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  titleHref?: string;
  titleBadge?: string;
  author?: string;
  date?: string;
  status?: string;
  detail: React.ReactNode;
}) {
  return (
    <>
      <tr
        className={isOpen ? "blog-row open" : "blog-row"}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <td className="blog-row-chevron">
          {isOpen ? (
            <ChevronDown className="blog-chevron" aria-hidden="true" />
          ) : (
            <ChevronRight className="blog-chevron" aria-hidden="true" />
          )}
        </td>
        <td className="blog-row-name">
          <span className="blog-row-title-wrap">
            {icon}
            {titleHref ? (
              <Link
                to={titleHref}
                className="blog-row-title"
                onClick={(e) => e.stopPropagation()}
              >
                {title}
              </Link>
            ) : (
              <span className="blog-row-title">{title}</span>
            )}
            {titleBadge && <span className="blog-row-count">{titleBadge}</span>}
          </span>
        </td>
        <td className="blog-row-author">{author}</td>
        <td className="blog-row-date mono">{date ?? "—"}</td>
        <td className="blog-row-status">
          {status && <span className="blog-badge">{status}</span>}
        </td>
      </tr>
      {isOpen && (
        <tr className="blog-detail-row">
          <td />
          <td colSpan={4}>{detail}</td>
        </tr>
      )}
    </>
  );
}
