// The review threads on one model target, beside the explorer's inspector. The
// same rail a page gets, minus anything anchored in rendered prose: a model
// thread is always about the whole element, view, or model.
import { useMemo, useRef } from "react";
import { type ModelTarget, modelRef, modelSlug } from "../../lib/content-ref";
import CommentSidebar from "../review/CommentSidebar";
import { ReviewProvider } from "../review/review-context";
import { SelectionProvider } from "../review/selection-context";

export default function ModelThreads({ target }: { target: ModelTarget }) {
  // CommentSidebar reads headings from an article; a model target has none.
  const articleRef = useRef<HTMLElement>(null);
  const slug = modelSlug(target);
  // The review queries key on the ref, so it changes only with the target.
  const contentRef = useMemo(() => modelRef(slug), [slug]);
  return (
    <SelectionProvider>
      <ReviewProvider contentRef={contentRef}>
        <article ref={articleRef} hidden />
        <CommentSidebar articleRef={articleRef} />
      </ReviewProvider>
    </SelectionProvider>
  );
}
