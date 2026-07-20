import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Shell from "../components/layout/Shell";
import BlogTable from "../components/BlogTable";
import TagList from "../components/TagList";
import {
  blogPosts,
  blogsBySeriesFiltered,
  blogsByTag,
  blogTags,
  readingTimeMinutes,
} from "../content";
import { getTag, tagLabel } from "../tags";

function BlogReadingTime({
  articleRef,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
}) {
  const [minutes, setMinutes] = useState(1);

  useEffect(() => {
    const text = articleRef.current?.textContent ?? "";
    if (text) setMinutes(readingTimeMinutes(text));
  }, [articleRef]);

  return <span>{minutes} min read</span>;
}

export { BlogReadingTime };

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get("tag")?.trim() ?? "";
  const filteredPosts = activeTag ? blogsByTag(activeTag) : blogPosts;
  const { series, standalone } = blogsBySeriesFiltered(filteredPosts);
  const allTags = blogTags();

  const clearTagFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("tag");
    setSearchParams(next, { replace: true });
  };

  return (
    <Shell wide>
      <h1>Blog</h1>
      <p className="muted">
        Narrative drafts on the Open Lakehouse — architecture, governance, and building
        on open formats.
      </p>

      {activeTag && (
        <div className="blog-tag-filter" aria-live="polite">
          <span className="blog-tag-filter-label">Filtered by topic</span>
          <span className="tag tag-active">{tagLabel(activeTag)}</span>
          <button type="button" className="blog-tag-filter-clear" onClick={clearTagFilter}>
            Clear filter
          </button>
          {filteredPosts.length === 0 && (
            <p className="muted blog-tag-filter-empty">
              No posts tagged &ldquo;{tagLabel(activeTag)}&rdquo; yet.
            </p>
          )}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="blog-tags-section">
          <p className="blog-tags-label">Topics</p>
          <TagList tags={allTags} />
        </div>
      )}

      {activeTag && getTag(activeTag).element && (
        <p className="muted blog-tag-model-hint">
          Related model object:{" "}
          <Link to={`/explain/${getTag(activeTag).element}`}>
            {getTag(activeTag).element}
          </Link>
        </p>
      )}

      <BlogTable series={series} standalone={standalone} />
    </Shell>
  );
}
