import { FileText, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import TagList from "./TagList";
import AuthorBadge from "./AuthorBadge";
import BlogPostDetail from "./BlogPostDetail";
import ContentTable, { type ContentRow } from "./ContentTable";
import type { ContentVisibility } from "../lib/content-visibility";
import type { BlogSeriesGroup, ContentPage } from "../content";

interface BlogTableProps {
  series: BlogSeriesGroup[];
  standalone: ContentPage[];
  /** Viewer-aware status/columns. When allowlisted, rows carry status columns. */
  vis: ContentVisibility;
}

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
                {fm.status && <span className="blog-post-status">{fm.status}</span>}
              </div>
              {fm.summary && <p className="blog-series-post-summary">{fm.summary}</p>}
              <TagList tags={fm.tags ?? []} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function BlogTable({ series, standalone, vis }: BlogTableProps) {
  const rows: ContentRow[] = [
    // A series row aggregates several posts, so it has no single review state —
    // it carries only the "series" label in the author-status column.
    ...series.map((group) => ({
      id: `series:${group.series}`,
      icon: <Layers className="blog-row-icon" aria-hidden="true" />,
      title: group.series,
      titleBadge: `${group.posts.length} posts`,
      author: <span className="author-badge-empty">—</span>,
      frontmatterStatus: "series",
      detail: <SeriesDetail posts={group.posts} />,
    })),
    ...standalone.map((post) => {
      const fm = post.frontmatter;
      const status = vis.statusFor(post);
      return {
        id: `post:${post.slug}`,
        icon: <FileText className="blog-row-icon" aria-hidden="true" />,
        title: fm.title ?? post.slug,
        titleHref: post.href,
        author: <AuthorBadge byline={fm.author} />,
        frontmatterStatus: status.frontmatter,
        reviewState: status.reviewState,
        detail: <BlogPostDetail post={post} />,
      };
    }),
  ];

  return <ContentTable rows={rows} showStatus={vis.showStatusColumns} />;
}
