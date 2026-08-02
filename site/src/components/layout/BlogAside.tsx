// Blog left aside: context, heading navigation, and contributors.
import type { RefObject } from "react";
import TagList from "../TagList";
import BlogContributors from "./BlogContributors";
import OnThisPage from "./OnThisPage";

interface BlogAsideProps {
  articleRef: RefObject<HTMLElement | null>;
  byline?: string;
  tags?: string[];
}

export default function BlogAside({ articleRef, byline, tags = [] }: BlogAsideProps) {
  const navContent = (
    <>
      {tags.length > 0 && (
        <section className="blog-aside-tags" aria-label="Context">
          <p className="blog-aside-title">Context</p>
          <TagList tags={tags} />
        </section>
      )}
      <OnThisPage articleRef={articleRef} />
      <BlogContributors byline={byline} />
    </>
  );

  return (
    <div className="blog-post-aside">
      {/* Desktop: sticky left aside. Hidden on narrow screens. */}
      <div className="blog-aside-panel">
        <div className="blog-aside-body">{navContent}</div>
      </div>

      {/* Narrow screens: TOC + contributors remain visible above the article. */}
      <div className="blog-aside-mobile">
        <div className="blog-aside-body">{navContent}</div>
      </div>
    </div>
  );
}
