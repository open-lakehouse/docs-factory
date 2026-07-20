import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Shell from "../components/layout/Shell";
import BlogTable from "../components/BlogTable";
import TagList from "../components/TagList";
import {
  blogPosts,
  blogsBySeriesFiltered,
  blogsByTags,
  blogTags,
  readingTimeMinutes,
} from "../content";

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
  const activeTags = [
    ...new Set(searchParams.getAll("tag").map((t) => t.trim()).filter(Boolean)),
  ];
  const filteredPosts = blogsByTags(activeTags);
  const { series, standalone } = blogsBySeriesFiltered(filteredPosts);
  const allTags = blogTags();

  const setTags = (tags: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete("tag");
    for (const tag of tags) next.append("tag", tag);
    setSearchParams(next, { replace: true });
  };

  const toggleTag = (slug: string) => {
    setTags(
      activeTags.includes(slug)
        ? activeTags.filter((t) => t !== slug)
        : [...activeTags, slug],
    );
  };

  return (
    <Shell wide>
      <h1>Blog</h1>
      <p className="muted">
        Narrative drafts on the Open Lakehouse — architecture, governance, and building
        on open formats.
      </p>

      {allTags.length > 0 && (
        <div className="blog-tags-section">
          <div className="blog-tags-heading">
            <p className="blog-tags-label">Topics</p>
            {activeTags.length > 0 && (
              <button
                type="button"
                className="blog-tags-clear"
                onClick={() => setTags([])}
              >
                Clear all
              </button>
            )}
          </div>
          <TagList tags={allTags} activeTags={activeTags} onToggle={toggleTag} />
        </div>
      )}

      {activeTags.length > 0 && filteredPosts.length === 0 && (
        <p className="muted blog-tag-filter-empty">
          No posts match all selected topics.
        </p>
      )}

      <BlogTable series={series} standalone={standalone} />
    </Shell>
  );
}
