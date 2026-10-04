import {
  Check,
  Copy,
  CornerDownLeft,
  FileText,
  Hash,
  type LucideIcon,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { copyFromUrl } from "../lib/clipboard";
import { excerpt, loadIndex, type PageHits, searchDocs } from "../lib/search";
import { toggleTheme, useDarkMode } from "../lib/theme";
import { site } from "../site";

interface Option {
  key: string;
  icon: LucideIcon;
  label: ReactNode;
  /** What a typed query matches a command against; search hits never use it. */
  keywords?: string;
  detail?: ReactNode;
  run: () => void;
}

interface Group {
  label: ReactNode;
  options: Option[];
}

type IndexState =
  | { status: "loading" }
  | { status: "ready"; index: Awaited<ReturnType<typeof loadIndex>> }
  | { status: "error" };

function Crumbs({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.filter(Boolean).map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are positional.
        <span key={i} className="cmdk-crumb">
          {p}
        </span>
      ))}
    </>
  );
}

function hitGroups(results: PageHits[], go: (to: string) => void): Group[] {
  return results.map((r) => ({
    label: (
      <>
        <Crumbs parts={r.section.slice(-1)} />
        <span className="cmdk-group-page">{r.page}</span>
      </>
    ),
    options: r.hits.map((hit) => {
      const segments = excerpt(hit.text, hit.terms);
      return {
        key: hit.id,
        icon: hit.anchor ? Hash : FileText,
        label: hit.heading ?? hit.page,
        detail: segments.length
          ? segments.map((s, i) =>
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional.
              s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
            )
          : undefined,
        run: () => go(hit.anchor ? `${hit.route}#${hit.anchor}` : hit.route),
      };
    }),
  }));
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [index, setIndex] = useState<IndexState>({ status: "loading" });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dark = useDarkMode();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const page = site.pages.find((p) => p.route === pathname.replace(/\/+$/, ""));
  const q = query.trim();

  useEffect(() => {
    let alive = true;
    loadIndex().then(
      (index) => alive && setIndex({ status: "ready", index }),
      () => alive && setIndex({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, []);

  // showModal() puts the dialog in the top layer and makes the page inert.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    input.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const go = (to: string) => {
      onClose();
      navigate(to);
    };
    const commands: Option[] = [];
    if (page) {
      commands.push(
        {
          key: "copy",
          icon: copied ? Check : Copy,
          label: copied ? "Copied" : "Copy page as Markdown",
          keywords: "copy page as markdown",
          detail: "For pasting into an AI assistant",
          // The copy must start inside the key or click event (see copyFromUrl).
          run: () =>
            void copyFromUrl(page.twin).then((ok) => {
              if (!ok) return onClose();
              setCopied(true);
              setTimeout(onClose, 700);
            }),
        },
        {
          key: "twin",
          icon: FileText,
          label: "View as Markdown",
          keywords: "view as markdown",
          detail: "The page as plain text",
          // The twin is a static file, not a route.
          run: () => window.location.assign(page.twin),
        },
      );
    }
    commands.push({
      key: "theme",
      icon: dark ? Sun : Moon,
      label: dark ? "Switch to light mode" : "Switch to dark mode",
      keywords: "toggle theme dark light mode",
      run: () => {
        toggleTheme();
        onClose();
      },
    });

    const pageOptions = (pages: typeof site.pages): Option[] =>
      pages.map((p) => ({
        key: p.route,
        icon: FileText,
        label: p.title,
        detail: <Crumbs parts={p.section} />,
        run: () => go(p.route),
      }));

    if (!q) {
      return [
        { label: "Commands", options: commands },
        { label: "Pages", options: pageOptions(site.pages) },
      ];
    }
    const needle = q.toLowerCase();
    const matching = commands.filter((c) => c.keywords?.includes(needle));
    const out: Group[] = matching.length ? [{ label: "Commands", options: matching }] : [];
    if (index.status === "ready") out.push(...hitGroups(searchDocs(index.index, q), go));
    else if (index.status === "error") {
      const byTitle = site.pages.filter((p) => p.title.toLowerCase().includes(needle));
      if (byTitle.length) out.push({ label: "Pages", options: pageOptions(byTitle) });
    }
    return out;
  }, [q, index, page, dark, copied, navigate, onClose]);

  const options = groups.flatMap((g) => g.options);
  const current = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at the top.
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (current >= 0)
      document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      options[current]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The input is the dialog's only stop; keep focus inside.
      e.preventDefault();
    }
  };

  let status: string | null = null;
  if (q && index.status === "loading") status = "Loading the search index…";
  else if (q && index.status === "error")
    status = "Full-text search is unavailable; matching titles only.";
  else if (q && !options.length) status = `No results for “${q}”.`;

  let i = 0;
  return (
    <dialog
      ref={dialog}
      className="cmdk"
      aria-label="Search documentation"
      onCancel={(e) => {
        // Esc: let React unmount it rather than the browser closing it under us.
        e.preventDefault();
        onClose();
      }}
      // The dialog's own box is only reachable as the ::backdrop outside the panel.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk-panel">
        <div className="cmdk-input">
          <Search aria-hidden="true" />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            aria-autocomplete="list"
            placeholder="Search docs or run a command…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list" id={listId} role="listbox" aria-label="Results">
          {groups.map((g, gi) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional.
            // biome-ignore lint/a11y/useSemanticElements: a listbox groups options with role="group", not <fieldset>.
            <div key={gi} role="group" className="cmdk-group">
              <div className="cmdk-group-label" role="presentation">
                {g.label}
              </div>
              {g.options.map((o) => {
                const at = i++;
                const Icon = o.icon;
                return (
                  <div
                    key={o.key}
                    id={optionId(at)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={at === current}
                    className="cmdk-option"
                    onMouseMove={() => at !== current && setActive(at)}
                    // Keep focus in the input so typing continues after a click.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={o.run}
                    onKeyDown={onKeyDown}
                  >
                    <Icon aria-hidden="true" />
                    <span className="cmdk-option-body">
                      <span className="cmdk-option-label">{o.label}</span>
                      {o.detail && <span className="cmdk-option-detail">{o.detail}</span>}
                    </span>
                    {at === current && <CornerDownLeft className="cmdk-enter" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          ))}
          {status && <p className="cmdk-status">{status}</p>}
        </div>
        <div className="cmdk-footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </dialog>
  );
}
