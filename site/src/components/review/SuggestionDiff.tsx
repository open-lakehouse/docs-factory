import { cn } from "@/lib/utils";
import { diffSuggestion } from "../../lib/suggestion-diff";

/** A suggested edit as an inline diff; a deletion shows the struck original. */
export default function SuggestionDiff({
  original,
  replacement,
  code = false,
}: {
  original: string;
  replacement: string;
  code?: boolean;
}) {
  const parts = diffSuggestion(original, replacement, code ? "lines" : "words");
  return (
    <div className={cn("review-suggestion", code && "code")}>
      <span className="review-suggestion-label">
        {replacement ? "Suggested edit" : "Suggested deletion"}
      </span>
      <div className="review-suggestion-diff">
        {parts.map((p, i) =>
          p.kind === "same" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
            <span key={i}>{p.text}</span>
          ) : p.kind === "del" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
            <del key={i}>{p.text}</del>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
            <ins key={i}>{p.text}</ins>
          ),
        )}
      </div>
    </div>
  );
}
