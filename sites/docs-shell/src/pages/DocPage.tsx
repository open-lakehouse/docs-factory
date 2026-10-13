import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Lightbulb,
  type LucideIcon,
  Wrench,
} from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import OnThisPage from "../components/layout/OnThisPage";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import PageActions from "../components/PageActions";
import MdxComponents from "../mdx-components";
import { type PageMeta, useContent } from "../site";

const DIATAXIS: Record<string, { label: string; Icon: LucideIcon }> = {
  tutorial: { label: "Tutorial", Icon: GraduationCap },
  "how-to": { label: "Guide", Icon: Wrench },
  reference: { label: "Reference", Icon: BookOpen },
  explanation: { label: "Concept", Icon: Lightbulb },
};

// nav.yml groups pages under Diátaxis-named subsections; the type tag already
// says that, so those labels drop out of the trail.
const TYPE_SECTIONS = new Set(["Tutorials", "How-to guides", "Concepts", "Reference"]);

export default function DocPage({ page }: { page: PageMeta }) {
  const Content = useContent(page);
  const { hash } = useLocation();
  const kind = DIATAXIS[page.diataxis];
  const trail = page.section.filter((s) => s && !TYPE_SECTIONS.has(s));

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
            {kind && (
              <span className="kind" data-kind={page.diataxis}>
                <kind.Icon size={13} aria-hidden="true" />
                {kind.label}
              </span>
            )}
            {trail.length > 0 && (
              <span className="trail">
                {trail.map((s, i) => (
                  <span key={s} className="crumb">
                    {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
                    {s}
                  </span>
                ))}
              </span>
            )}
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
