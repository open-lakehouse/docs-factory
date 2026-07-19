import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumbs from "../components/layout/Breadcrumbs";
import OnThisPage from "../components/layout/OnThisPage";
import CommentSidebar from "../components/review/CommentSidebar";
import ReviewControls from "../components/review/ReviewControls";
import { blogRef } from "../lib/content-ref";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import ConceptHeader from "../components/ConceptHeader";
import TagList from "../components/TagList";
import AuthorBadge from "../components/AuthorBadge";
import MdxProvider from "../MdxProvider";
import { blogNeighbors, findBlog, blogPosts } from "../content";
import { BlogReadingTime } from "./BlogIndex";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const page = findBlog(slug);
  const articleRef = useRef<HTMLElement>(null);

  if (!page) {
    return (
      <Shell>
        <p>
          Not found: blog/{slug}. <Link to="/blog">Back to blog.</Link>
        </p>
      </Shell>
    );
  }

  const { Component, frontmatter } = page;
  const neighbors = blogNeighbors(slug);

  const siblingPosts = frontmatter.series
    ? blogPosts.filter((p) => p.frontmatter.series === frontmatter.series)
    : blogPosts.filter((p) => !p.frontmatter.series);
  const postSiblings = siblingPosts.map((p) => ({
    label: p.frontmatter.title ?? p.slug,
    href: p.href,
  }));

  return (
    <Shell wide>
      <div className="blog-post-layout">
        <div className="blog-post-main">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Blog", href: "/blog" },
              {
                label: frontmatter.title ?? slug,
                siblings: postSiblings,
                activeHref: page.href,
              },
            ]}
          />
          <header className="blog-post-header">
            {frontmatter.series && (
              <p className="blog-post-series">{frontmatter.series}</p>
            )}
            {frontmatter.title && <h1>{frontmatter.title}</h1>}
            <div className="blog-post-meta">
              {frontmatter.author && <AuthorBadge byline={frontmatter.author} />}
              {frontmatter.date && <span>{frontmatter.date}</span>}
              {frontmatter.status && (
                <span className="blog-post-status">{frontmatter.status}</span>
              )}
              <BlogReadingTime articleRef={articleRef} />
            </div>
            <ReviewControls contentRef={blogRef(slug)} />
            <TagList tags={frontmatter.tags ?? []} />
          </header>
          <ConceptHeader references={frontmatter.references} />
          <article className="prose" ref={articleRef}>
            <MdxProvider>
              <Component />
            </MdxProvider>
          </article>
          <Pager
            prev={
              neighbors.prev
                ? {
                    label: neighbors.prev.frontmatter.title ?? neighbors.prev.slug,
                    href: neighbors.prev.href,
                  }
                : undefined
            }
            next={
              neighbors.next
                ? {
                    label: neighbors.next.frontmatter.title ?? neighbors.next.slug,
                    href: neighbors.next.href,
                  }
                : undefined
            }
          />
        </div>
        <OnThisPage articleRef={articleRef} />
        <CommentSidebar contentRef={blogRef(slug)} articleRef={articleRef} />
      </div>
    </Shell>
  );
}
