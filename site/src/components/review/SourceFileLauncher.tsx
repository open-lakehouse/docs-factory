// SourceFileLauncher — adds an "Open full source" affordance to every `file=`
// snippet block in the article (for allowlisted viewers) and hosts the
// SourceFilePane it opens. The in-doc snippet is a window onto a git-tracked
// file; this lets reviewers pop the whole file and comment on any line.
//
// Source metadata (data-src-*) lives on the inner Shiki <pre>, so we scan for
// that and attach the button to the outer .cb chrome wrapper.
import { useEffect, useState, type RefObject } from "react";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import SourceFilePane from "./SourceFilePane";

interface OpenTarget {
  path: string;
  anchorSlug: string;
  headingText: string;
}

/** Nearest preceding heading (h1–h4) with an id for a snippet block. */
function headingFor(el: Element, article: HTMLElement): { slug: string; text: string } {
  const headings = Array.from(article.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[];
  let best: HTMLElement | null = null;
  for (const h of headings) {
    if (!h.id) continue;
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    else break;
  }
  return best ? { slug: best.id, text: best.textContent ?? "" } : { slug: "", text: "" };
}

/** Outer .cb chrome for an element carrying data-src-path (usually .cb-pre). */
function codeChrome(el: HTMLElement): HTMLElement | null {
  return el.closest(".cb") ?? el.parentElement;
}

export default function SourceFileLauncher({
  contentRef,
  articleRef,
}: {
  contentRef: ContentRef;
  articleRef: RefObject<HTMLElement | null>;
}) {
  const { reviewActive } = useAuth();
  const [open, setOpen] = useState<OpenTarget | null>(null);

  useEffect(() => {
    if (!reviewActive) return;
    const article = articleRef.current;
    if (!article) return;

    const blocks = Array.from(article.querySelectorAll<HTMLElement>("[data-src-path]"));
    const added: HTMLButtonElement[] = [];
    for (const block of blocks) {
      const path = block.dataset.srcPath;
      if (!path) continue;
      const chrome = codeChrome(block);
      if (!chrome || chrome.querySelector(".cb-review-source")) continue;
      const btn = document.createElement("button");
      btn.className = "cb-review-source";
      btn.type = "button";
      btn.textContent = "Review source";
      btn.title = `Open full source: ${path}`;
      btn.addEventListener("click", () => {
        const { slug, text } = headingFor(block, article);
        setOpen({ path, anchorSlug: slug, headingText: text });
      });
      chrome.appendChild(btn);
      added.push(btn);
    }
    return () => {
      for (const b of added) b.remove();
    };
  }, [articleRef, reviewActive]);

  if (!reviewActive || !open) return null;
  return (
    <SourceFilePane
      contentRef={contentRef}
      path={open.path}
      anchorSlug={open.anchorSlug}
      headingText={open.headingText}
      onClose={() => setOpen(null)}
    />
  );
}
