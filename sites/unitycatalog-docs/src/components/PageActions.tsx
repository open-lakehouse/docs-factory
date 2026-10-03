import { Check, ChevronDown, Copy, Download, FileCode, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyFromUrl } from "../lib/clipboard";
import type { PageMeta } from "../site";

export default function PageActions({ page }: { page: PageMeta }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async (url: string) => {
    setOpen(false);
    if (await copyFromUrl(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Icon = copied ? Check : Copy;
  return (
    <div className="page-actions" ref={root}>
      <button
        type="button"
        className="pa-main"
        data-copied={copied ? "true" : undefined}
        onClick={() => copy(page.twin)}
      >
        <Icon aria-hidden="true" />
        {copied ? "Copied" : "Copy page"}
      </button>
      <button
        type="button"
        className="pa-toggle"
        ref={toggle}
        aria-label="More page actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="pa-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => copy(page.twin)}>
            <Copy aria-hidden="true" />
            <span>
              Copy page as Markdown
              <small>For pasting into an AI assistant</small>
            </span>
          </button>
          <a role="menuitem" href={page.twin}>
            <FileText aria-hidden="true" />
            <span>
              View as Markdown
              <small>The page as plain text</small>
            </span>
          </a>
          {page.scripts.map((s) => (
            <div key={s.url} className="pa-script" role="none">
              <button type="button" role="menuitem" onClick={() => copy(s.url)}>
                <FileCode aria-hidden="true" />
                <span>
                  Copy {s.file}
                  {s.summary && <small>{s.summary}</small>}
                </span>
              </button>
              <a
                role="menuitem"
                className="pa-download"
                href={s.url}
                download={s.file}
                aria-label={`Download ${s.file}`}
              >
                <Download aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
