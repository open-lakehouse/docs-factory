// code-block.tsx — sleek chrome around build-time Shiki <pre> output.
// remark-fence-meta + @shikijs/rehype highlight fences at compile time;
// MdxProvider maps `pre` here. Clean surface with a floating copy button in the
// top-right; a slim header bar is rendered ONLY when the fence carries a
// filename (title="…"), so headerless blocks keep their clean lines.
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
    <div className="cb" data-lang={lang} data-has-filename={hasFilename ? "true" : undefined}>
      {hasFilename && (
        <div className="cb-head">
          <span className="cb-file">{filename}</span>
        </div>
      )}
      <pre {...props} className={className ? `cb-pre ${className}` : "cb-pre"}>
        {children}
      </pre>
      <CodeCopyButton code={code} />
    </div>
  );
}
