import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { type NavItem, site } from "../../site";

// Sections at these depths collapse; deeper labels are plain group headings.
const COLLAPSIBLE_DEPTH = 2;
const STORAGE_KEY = "nav-open";

// Each page renders its own Shell, so the sidebar remounts on navigation; the
// open set lives at module scope to survive that, and in sessionStorage to
// survive a reload. It starts null so the first render matches the prerender.
let remembered: Set<string> | null = null;

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Keys of the sections on the path to `route`, or null if it isn't in the nav. */
function ancestorsOf(items: NavItem[], route: string, prefix = ""): string[] | null {
  for (const item of items) {
    if (item.kind === "page") {
      if (trimSlash(item.route) === route) return [];
      continue;
    }
    const key = `${prefix}${item.label}`;
    const below = ancestorsOf(item.items, route, `${key}/`);
    if (below) return [key, ...below];
  }
  return null;
}

function initialOpen(pathname: string): Set<string> {
  const active = ancestorsOf(site.nav, trimSlash(pathname));
  const first = site.nav.find((item) => item.kind === "section");
  // Off-nav pages (home, 404) open the first section so the panel isn't bare.
  const defaults = active ?? (first ? [first.label] : []);
  return new Set([...(remembered ?? []), ...defaults]);
}

function Items({
  items,
  depth,
  prefix,
  open,
  toggle,
}: {
  items: NavItem[];
  depth: number;
  prefix: string;
  open: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <ul className="nav-list" data-depth={depth}>
      {items.map((item) => {
        if (item.kind === "page") {
          return (
            <li key={item.route}>
              <NavLink to={item.route} className="nav-link" end>
                {item.label}
              </NavLink>
            </li>
          );
        }
        const key = `${prefix}${item.label}`;
        const children = (
          <Items
            items={item.items}
            depth={depth + 1}
            prefix={`${key}/`}
            open={open}
            toggle={toggle}
          />
        );
        if (depth >= COLLAPSIBLE_DEPTH) {
          return (
            <li key={key} className="nav-section">
              <p className="nav-section-label">{item.label}</p>
              {children}
            </li>
          );
        }
        const expanded = open.has(key);
        return (
          <li key={key} className="nav-section" data-open={expanded || undefined}>
            <button
              type="button"
              className="nav-section-label"
              aria-expanded={expanded}
              onClick={() => toggle(key)}
            >
              {item.label}
            </button>
            {/* `hidden` rather than unmounting keeps every link in the prerendered HTML. */}
            <div hidden={!expanded}>{children}</div>
          </li>
        );
      })}
    </ul>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => initialOpen(pathname));

  useEffect(() => {
    if (remembered) return;
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) {
        setOpen((current) => new Set([...current, ...stored.map(String)]));
      }
    } catch {
      // Storage blocked or corrupt: fall back to the route's defaults.
    }
  }, []);

  useEffect(() => {
    remembered = open;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
    } catch {
      // Storage blocked: the open set still lasts for this tab's navigations.
    }
  }, [open]);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <nav className="sidebar" aria-label="Documentation">
      <Items items={site.nav} depth={0} prefix="" open={open} toggle={toggle} />
    </nav>
  );
}
