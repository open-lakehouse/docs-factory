// code-block.tsx — console chrome around build-time Shiki <pre> output.
// remark-fence-meta + @shikijs/rehype highlight fences at compile time;
// MdxProvider maps `pre` here so every block gets traffic-light dots,
// filename, language label, and a copy button.
import { Children, isValidElement, type ReactNode } from "react";
import CodeCopyButton from "./CodeCopyButton";

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  "data-filename"?: string;
  "data-lang"?: string;
  children?: ReactNode;
}

/** Extract plain text from highlighted <pre><code> children for the clipboard. */
function extractCode(children: ReactNode): string {
  const parts: string[] = [];
  const walk = (node: ReactNode) => {
    if (typeof node === "string") parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement<{ children?: ReactNode }>(node)) {
      Children.forEach(node.props.children, walk);
    }
  };
  walk(children);
  return parts.join("");
}

export function Pre({
  children,
  "data-filename": filename = "",
  "data-lang": lang = "text",
  className,
  ...props
}: PreProps) {
  const code = extractCode(children);
  const hasFilename = Boolean(filename);

  return (
    <div className="cb">
      <div className={hasFilename ? "cb-head" : "cb-head cb-head-nameonly"}>
        <div className="cb-dots" aria-hidden="true">
          <span className="cb-dot cb-dot-red" />
          <span className="cb-dot cb-dot-yellow" />
          <span className="cb-dot cb-dot-green" />
        </div>
        {hasFilename && (
          <div className="cb-tabs">
            <span className="cb-tab">{filename}</span>
          </div>
        )}
        <span className="cb-lang">{lang}</span>
        <CodeCopyButton code={code} />
      </div>
      <pre {...props} className={className ? `cb-pre ${className}` : "cb-pre"}>
        {children}
      </pre>
    </div>
  );
}
