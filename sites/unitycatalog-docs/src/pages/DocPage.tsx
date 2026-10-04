import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import OnThisPage from "../components/layout/OnThisPage";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import PageActions from "../components/PageActions";
import MdxComponents from "../mdx-components";
import { type PageMeta, useContent } from "../site";

const DIATAXIS_LABEL: Record<string, string> = {
  tutorial: "tutorial",
  "how-to": "how-to",
  reference: "reference",
  explanation: "explanation",
};

export default function DocPage({ page }: { page: PageMeta }) {
  const Content = useContent(page);
  const { hash } = useLocation();

  // Client-side navigation doesn't reset scroll; anchor links still should land.
  // A route's content can arrive after the first render, so its target heading
  // may only exist once `Content` does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run per page, per in-page jump, and once content loads.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [page.route, hash, Content]);

  return (
    <Shell aside={<OnThisPage headings={page.headings} />}>
      <article className="prose">
        <div className="page-head">
          <p className="eyebrow">
            {page.section.filter(Boolean).map((s) => (
              <span key={s} className="crumb">
                {s}
              </span>
            ))}
            <span className="kind" data-kind={page.diataxis}>
              {DIATAXIS_LABEL[page.diataxis] ?? page.diataxis}
            </span>
          </p>
          <PageActions page={page} />
        </div>
        <h1>{page.title}</h1>
        {page.summary && <p className="lead">{page.summary}</p>}
        <MdxComponents>{Content ? <Content /> : null}</MdxComponents>
      </article>
      <Pager prev={page.prev} next={page.next} />
    </Shell>
  );
}
