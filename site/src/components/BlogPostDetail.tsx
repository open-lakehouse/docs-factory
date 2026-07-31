import { Link } from "react-router-dom";
import TagList from "./TagList";
import AuthorBadge from "./AuthorBadge";
import type { ContentPage } from "../content";

/** Expandable metadata panel for a blog post (summary + series/author/status/target/tags). */
export default function BlogPostDetail({ post }: { post: ContentPage }) {
  const fm = post.frontmatter;
  return (
    <div className="blog-detail">
      {fm.summary && <p className="blog-detail-summary">{fm.summary}</p>}
      <dl className="blog-meta-grid">
        {fm.series && (
          <div className="blog-meta blog-meta-wide">
            <dt>Series</dt>
            <dd>
              <span className="blog-detail-series">{fm.series}</span>
              {fm.series_order != null && (
                <span className="mono blog-detail-series-order">
                  {" "}
                  · part {fm.series_order}
                </span>
              )}
            </dd>
          </div>
        )}
        {fm.author && (
          <div className="blog-meta">
            <dt>Author</dt>
            <dd>
              <AuthorBadge byline={fm.author} />
            </dd>
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
              <TagList tags={fm.tags} />
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
