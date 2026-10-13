import { Check, ChevronDown, Container, Copy, Download, FileCode, FileText } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { copyFromUrl, copyToClipboard } from "../lib/clipboard";
import { useMenu } from "../lib/menu";
import type { PageMeta } from "../site";

export default function PageActions({ page }: { page: PageMeta }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useMenu(open, close, root, toggle);

  const flash = (ok: boolean) => {
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const copy = async (url: string) => {
    setOpen(false);
    flash(await copyFromUrl(url));
  };
  const copyText = async (text: string) => {
    setOpen(false);
    flash(await copyToClipboard(text));
  };
  const env = page.environment;

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
          {env && (
            <div className="pa-script" role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => copyText(`${env.commands.join("\n")}\n`)}
              >
                <Container aria-hidden="true" />
                <span>
                  Copy environment setup
                  <small>{env.title}</small>
                </span>
              </button>
              <a
                role="menuitem"
                className="pa-download"
                href={env.bundle}
                download
                aria-label="Download the environment"
              >
                <Download aria-hidden="true" />
              </a>
            </div>
          )}
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
