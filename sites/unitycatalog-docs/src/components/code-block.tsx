// Chrome around build-time Shiki <pre> output; mdx-components maps `pre` here.
import { ChevronRight, FileCode } from "lucide-react";
import { Children, isValidElement, type ReactNode, useState } from "react";
import CodeCopyButton from "./CodeCopyButton";

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  "data-filename"?: string;
  "data-lang"?: string;
  "data-collapse"?: string;
  children?: ReactNode;
}

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
  "data-collapse": collapseAttr,
  className,
  ...props
}: PreProps) {
  const code = extractCode(children);
  const hasFilename = Boolean(filename);
  const collapsible = collapseAttr === "true";
  const [open, setOpen] = useState(false);
  const expanded = !collapsible || open;

  return (
    <div
      className="cb"
      data-lang={lang}
      data-has-filename={hasFilename ? "true" : undefined}
      data-collapsed={collapsible && !expanded ? "true" : undefined}
    >
      {collapsible ? (
        <button
          type="button"
          className="cb-head cb-head-toggle"
          aria-expanded={expanded}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className="cb-chevron" aria-hidden="true" />
          <span className="cb-file">{filename || (expanded ? "Hide code" : "Show code")}</span>
        </button>
      ) : (
        hasFilename && (
          <div className="cb-head">
            <FileCode className="cb-file-icon" aria-hidden="true" />
            <span className="cb-file">{filename}</span>
          </div>
        )
      )}
      {/* Hidden, not unmounted: collapsed code stays in the prerendered HTML. */}
      <pre {...props} hidden={!expanded} className={className ? `cb-pre ${className}` : "cb-pre"}>
        {children}
      </pre>
      {/* `code` holds the full contents regardless of expand state. */}
      <CodeCopyButton code={code} />
    </div>
  );
}
