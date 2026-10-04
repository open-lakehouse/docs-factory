import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { loadIndex } from "../../lib/search";
import { toggleTheme, useDarkMode } from "../../lib/theme";
import { site } from "../../site";
import CommandPalette from "../CommandPalette";
import { UnityCatalogIcon } from "../UnityCatalogIcon";
import Sidebar from "./Sidebar";

const GITHUB = "https://github.com/unitycatalog/unitycatalog";

function ThemeToggle() {
  const Icon = useDarkMode() ? Sun : Moon;
  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  // The platform is only known in the browser; the prerender shows a neutral key.
  const [mod, setMod] = useState<string | null>(null);
  useEffect(() => setMod(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"), []);
  const prefetch = () => void loadIndex().catch(() => {});
  return (
    <button
      type="button"
      className="search-trigger"
      onClick={onOpen}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      aria-label="Search documentation"
      aria-keyshortcuts="Meta+K Control+K /"
    >
      <Search aria-hidden="true" />
      <span className="search-trigger-label">Search docs…</span>
      <kbd>{mod ? `${mod} K` : "K"}</kbd>
    </button>
  );
}

export default function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation.
  useEffect(() => setNavOpen(false), [pathname]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey;
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !isEditable(e.target);
      if (!modK && !slash) return;
      e.preventDefault();
      // ⌘K toggles, like most palettes; `/` only opens.
      setPaletteOpen((open) => (modK ? !open : true));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell" data-nav-open={navOpen || undefined}>
      <header className="topbar">
        <button
          type="button"
          className="icon-button nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
        >
          {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <Link to="/" className="brand">
          <UnityCatalogIcon className="brand-mark" aria-hidden="true" />
          <span>{site.title.toLowerCase()}</span>
          <span className="brand-path">/ docs</span>
        </Link>
        <nav className="topbar-links">
          <SearchTrigger onOpen={openPalette} />
          <a className="chip" href="/llms.txt">
            llms.txt
          </a>
          <a className="chip" href={GITHUB}>
            github
          </a>
          <ThemeToggle />
        </nav>
      </header>
      <div className="layout" data-aside={aside ? "true" : undefined}>
        <Sidebar />
        <main className="main">{children}</main>
        {aside && <aside className="aside">{aside}</aside>}
        <footer className="statusbar">
          <span className="statusbar-item">
            <span className="statusbar-dot" aria-hidden="true" />
            unity catalog oss
          </span>
          <span className="statusbar-links">
            <a href="/llms.txt">llms.txt</a>
            <a href="/llms-full.txt">llms-full.txt</a>
            <a href="/sitemap.xml">sitemap</a>
            <a href={GITHUB}>github</a>
          </span>
        </footer>
      </div>
      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}
