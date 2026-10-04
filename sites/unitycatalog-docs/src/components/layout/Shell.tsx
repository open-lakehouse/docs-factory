import { Menu, Moon, Sun, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { site } from "../../site";
import { UnityCatalogIcon } from "../UnityCatalogIcon";
import Sidebar from "./Sidebar";

const GITHUB = "https://github.com/unitycatalog/unitycatalog";

function ThemeToggle() {
  // index.html sets the class before paint; read it only after mount so the
  // prerendered markup and the first client render agree.
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Unpersisted is fine; the toggle still applies to this page.
    }
    setDark(next);
  };

  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" className="icon-button" onClick={toggle} aria-label="Toggle dark mode">
      <Icon aria-hidden="true" />
    </button>
  );
}

export default function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation.
  useEffect(() => setNavOpen(false), [pathname]);

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
    </div>
  );
}
