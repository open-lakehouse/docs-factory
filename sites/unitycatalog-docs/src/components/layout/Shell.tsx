import { Check, ChevronDown, Menu, Monitor, Moon, Search, Sun, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMenu } from "../../lib/menu";
import { loadIndex } from "../../lib/search";
import { setTheme, useThemePreference } from "../../lib/theme";
import { apiFor, defaultApi, site } from "../../site";
import CommandPalette from "../CommandPalette";
import { GITHUB, SOCIAL } from "../SocialIcons";
import { UnityCatalogIcon } from "../UnityCatalogIcon";
import Sidebar from "./Sidebar";

type Section = "docs" | "api";

const SECTIONS = [
  { value: "docs", label: "Docs", hint: "Guides, tutorials, and concepts" },
  { value: "api", label: "API", hint: "REST API reference" },
] as const;

// Switching returns to the last page read in that section. Module state rather
// than storage: it only needs to survive client navigations, and the prerender
// (which never navigates) renders the defaults the first client render matches.
const lastRoute: Record<Section, string> = { docs: "/", api: defaultApi?.route ?? "/" };

/** The current section, and where each section's switcher entry leads. */
function useSection() {
  const { pathname } = useLocation();
  const current: Section = apiFor(pathname) ? "api" : "docs";
  useEffect(() => {
    // A 404 is not a place to come back to.
    if (current === "api" || pathname === "/" || site.pages.some((p) => p.route === pathname))
      lastRoute[current] = pathname;
  }, [current, pathname]);
  // Re-selecting the current section goes to its start.
  const target = (section: Section) =>
    section !== current
      ? lastRoute[section]
      : section === "docs"
        ? "/"
        : (defaultApi?.route ?? "/");
  return { current, target };
}

function SectionTabs() {
  const { current, target } = useSection();
  return (
    <nav className="section-tabs" aria-label="Sections">
      {SECTIONS.map(({ value, label }) => (
        <Link
          key={value}
          to={target(value)}
          className="section-tab"
          aria-current={value === current ? "true" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

interface CrumbItem {
  key: string;
  to: string;
  label: string;
  hint: string;
  current: boolean;
}

/** A breadcrumb segment (`/ docs ▾`) that opens a menu of its siblings. */
function CrumbMenu({ label, name, items }: { label: string; name: string; items: CrumbItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenu(open, close, root, toggle);
  return (
    <div className="crumb-menu" ref={root}>
      <button
        type="button"
        className="brand-path"
        ref={toggle}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${name}: ${label}. Switch ${name.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true">/</span> {label}
        <ChevronDown className="crumb-menu-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="pa-menu" role="menu" aria-label={name}>
          {items.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              role="menuitemradio"
              aria-checked={item.current}
              onClick={close}
            >
              <span>
                {item.label}
                <small>{item.hint}</small>
              </span>
              {item.current && <Check className="theme-check" aria-hidden="true" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** `/ docs ▾` and, inside the API section, `/ <api> ▾`. */
function Breadcrumbs() {
  const { current, target } = useSection();
  const { pathname } = useLocation();
  const api = apiFor(pathname);
  return (
    <>
      <CrumbMenu
        name="Section"
        label={current}
        items={SECTIONS.map(({ value, label, hint }) => ({
          key: value,
          to: target(value),
          label,
          hint,
          current: value === current,
        }))}
      />
      {api && site.apis.length > 1 && (
        <CrumbMenu
          name="API"
          label={api.slug}
          items={site.apis.map((a) => ({
            key: a.route,
            to: a.route,
            label: a.title,
            hint: a.hint,
            current: a === api,
          }))}
        />
      )}
    </>
  );
}

const THEMES = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenu(open, close, root, toggle);
  // Prerendered markup can't see the stored choice; it renders the default.
  const preference = useThemePreference() ?? "system";
  const current = THEMES.find((t) => t.value === preference) ?? THEMES[0];
  return (
    <div className="theme-menu" ref={root}>
      <button
        type="button"
        className="icon-button"
        ref={toggle}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <current.Icon aria-hidden="true" />
      </button>
      {open && (
        <div className="pa-menu" role="menu" aria-label="Theme">
          {THEMES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === current.value}
              onClick={() => {
                setTheme(value);
                close();
                toggle.current?.focus();
              }}
            >
              <Icon aria-hidden="true" />
              {label}
              {value === current.value && <Check className="theme-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
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

export default function Shell({
  children,
  aside,
  sidebar = true,
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** Without it, main spans the full width and there is no drawer to toggle. */
  sidebar?: boolean;
}) {
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
    <div
      className="shell"
      data-nav-open={navOpen || undefined}
      data-no-sidebar={sidebar ? undefined : "true"}
    >
      <header className="topbar">
        {sidebar && (
          <button
            type="button"
            className="icon-button nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
          >
            {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        )}
        <Link to="/" className="brand">
          <UnityCatalogIcon className="brand-mark" aria-hidden="true" />
          <span>{site.title.toLowerCase()}</span>
          {!site.apis.length && <span className="brand-path">/ docs</span>}
        </Link>
        {site.apis.length > 0 && <Breadcrumbs />}
        {site.apis.length > 0 && <SectionTabs />}
        <nav className="topbar-links">
          <SearchTrigger onOpen={openPalette} />
          {SOCIAL.map(({ label, href, Icon }) => (
            <a
              key={label}
              className="icon-button social"
              href={href}
              aria-label={label}
              title={label}
            >
              <Icon aria-hidden="true" />
            </a>
          ))}
          <ThemeMenu />
        </nav>
      </header>
      <div className="layout" data-aside={aside ? "true" : undefined}>
        {sidebar && <Sidebar />}
        <main className="main">{children}</main>
        {aside && <aside className="aside">{aside}</aside>}
        <footer className="statusbar">
          <span className="statusbar-item">
            <span className="statusbar-dot" aria-hidden="true" />
            unity catalog oss
          </span>
          <span className="statusbar-links">
            <a href={GITHUB}>github</a>
          </span>
        </footer>
      </div>
      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}
