import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import OnThisPage from "../components/layout/OnThisPage";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import MdxComponents from "../mdx-components";
import { type PageMeta, useContent } from "../site";

const DIATAXIS_LABEL: Record<string, string> = {
  tutorial: "Tutorial",
  "how-to": "How-to guide",
  reference: "Reference",
  explanation: "Explanation",
};

export default function DocPage({ page }: { page: PageMeta }) {
  const Content = useContent(page);
  const { hash } = useLocation();

  // Client-side navigation doesn't reset scroll; anchor links still should land.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run per page.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [page.route]);

  return (
    <Shell aside={<OnThisPage headings={page.headings} />}>
      <article className="prose">
        <p className="eyebrow">
          {[...page.section, DIATAXIS_LABEL[page.diataxis] ?? page.diataxis]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1>{page.title}</h1>
        {page.summary && <p className="lead">{page.summary}</p>}
        <MdxComponents>{Content ? <Content /> : null}</MdxComponents>
      </article>
      <footer className="page-footer">
        <a href={page.twin}>View as Markdown</a>
      </footer>
      <Pager prev={page.prev} next={page.next} />
    </Shell>
  );
}
