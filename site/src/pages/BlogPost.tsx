import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import AuthorBadge from "../components/AuthorBadge";
import BlogAside from "../components/layout/BlogAside";
import BlogReviewAside from "../components/layout/BlogReviewAside";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import RelatedContent from "../components/RelatedContent";
import ReviewPageChrome from "../components/review/ReviewPageChrome";
import ReviewSurfaces from "../components/review/ReviewSurfaces";
import { ReviewProvider } from "../components/review/review-context";
import { SelectionProvider } from "../components/review/selection-context";
import { blogNeighbors, findBlog } from "../content";
import { blogRef } from "../lib/content-ref";
import MdxProvider from "../MdxProvider";
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
  const contentRef = blogRef(slug);

  return (
    <Shell wide>
      <SelectionProvider>
        <ReviewProvider contentRef={contentRef}>
          <div className="blog-post-layout">
            <div className="blog-post-body">
              <BlogAside
                articleRef={articleRef}
                byline={frontmatter.author}
                tags={frontmatter.tags ?? []}
              />
              <div className="blog-post-article">
                <ReviewPageChrome contentRef={contentRef} page={page} />
                <header className="blog-post-header">
                  {frontmatter.series && <p className="blog-post-series">{frontmatter.series}</p>}
                  {frontmatter.title && <h1>{frontmatter.title}</h1>}
                  <div className="blog-post-meta">
                    {frontmatter.author && <AuthorBadge byline={frontmatter.author} />}
                    <BlogReadingTime articleRef={articleRef} />
                  </div>
                </header>
                <article className="prose" ref={articleRef}>
                  <MdxProvider>
                    <Component />
                  </MdxProvider>
                  <RelatedContent page={page} />
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
              <BlogReviewAside articleRef={articleRef} contentRef={contentRef} />
            </div>
            <ReviewSurfaces contentRef={contentRef} articleRef={articleRef} />
          </div>
        </ReviewProvider>
      </SelectionProvider>
    </Shell>
  );
}
