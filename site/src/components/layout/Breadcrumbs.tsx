import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

export interface BreadcrumbSibling {
  label: string;
  href: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Sibling pages selectable from a dropdown on this crumb. */
  siblings?: BreadcrumbSibling[];
  /** Which sibling href is the active one (highlighted in the menu). */
  activeHref?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

function CrumbDropdown({
  item,
  isCurrent,
}: {
  item: BreadcrumbItem;
  isCurrent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const siblings = item.siblings ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="crumb-dropdown" ref={ref}>
      <button
        type="button"
        className={isCurrent ? "crumb-trigger crumb-trigger-current" : "crumb-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={isCurrent ? "page" : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{item.label}</span>
        <ChevronDownIcon className="crumb-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="crumb-menu" role="menu">
          {siblings.map((sib) => {
            const active = sib.href === item.activeHref;
            return (
              <Link
                key={sib.href}
                to={sib.href}
                role="menuitem"
                className={active ? "crumb-menu-item active" : "crumb-menu-item"}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <CheckIcon
                  className="crumb-menu-check"
                  aria-hidden="true"
                  style={{ visibility: active ? "visible" : "hidden" }}
                />
                <span className="crumb-menu-label">{sib.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const hasSiblings = (item.siblings?.length ?? 0) > 0;
          return (
            <li key={`${item.label}-${i}`}>
              {hasSiblings ? (
                <CrumbDropdown item={item} isCurrent={isLast} />
              ) : item.href && !isLast ? (
                <Link to={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
