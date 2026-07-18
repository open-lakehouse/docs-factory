import { useEffect, useRef, useState } from "react";
import Shell from "../components/layout/Shell";
import BlogTable from "../components/BlogTable";
import TagList from "../components/TagList";
import { blogPosts, blogsBySeries, blogTags, readingTimeMinutes } from "../content";

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
  const { series, standalone } = blogsBySeries();
  const allTags = blogTags();

  return (
    <Shell wide>
      <h1>Blog</h1>
      <p className="muted">
        Narrative drafts on the Open Lakehouse — architecture, governance, and building
        on open formats.
      </p>

      {allTags.length > 0 && (
        <div className="blog-tags-section">
          <p className="blog-tags-label">Topics</p>
          <TagList tags={allTags} />
        </div>
      )}

      <BlogTable series={series} standalone={standalone} />
    </Shell>
  );
}
