import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { useRouteBreadcrumbs } from "../../lib/route-breadcrumbs";
import type { BreadcrumbItemData } from "./Breadcrumbs";
import { CrumbDropdown } from "./Breadcrumbs";
import { ALL_SCOPE, SCOPES, useScope, withScope } from "../../scope";

function PathSegment({
  item,
  isLast,
}: {
  item: BreadcrumbItemData;
  isLast: boolean;
}) {
  const hasSiblings = (item.siblings?.length ?? 0) > 0;

  if (hasSiblings) {
    return <CrumbDropdown item={item} isCurrent={isLast} />;
  }

  if (item.href && !isLast) {
    return (
      <Link to={item.href} className="topbar-path-seg">
        {item.label}
      </Link>
    );
  }

  return (
    <span className="topbar-path-seg topbar-path-current" aria-current="page">
      {item.label}
    </span>
  );
}

/**
 * The `~/<scope>` root is a scope switcher: `open-lakehouse` shows everything;
 * `delta` / `unitycatalog` filter every axis. Each option keeps the current
 * path and only rewrites `?scope=`, so switching scope never navigates away.
 */
function ScopeRoot() {
  const { scopeId } = useScope();
  const { pathname, search } = useLocation();
  const current = `${pathname}${search}`;

  const scopeItem: BreadcrumbItemData = {
    label: `~/${scopeId}`,
    activeHref: withScope(current, scopeId === ALL_SCOPE ? null : scopeId),
    siblings: [
      { label: `~/${ALL_SCOPE}`, href: withScope(current, null) },
      ...SCOPES.map((s) => ({ label: `~/${s.label}`, href: withScope(current, s.id) })),
    ],
  };

  return (
    <span className="topbar-path-root">
      <CrumbDropdown item={scopeItem} isCurrent={false} />
    </span>
  );
}

export default function TopbarPath() {
  const items = useRouteBreadcrumbs();

  return (
    <nav className="topbar-crumbtrail" aria-label="Path">
      <ScopeRoot />
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          <span className="topbar-path-sep" aria-hidden="true">
            /
          </span>
          <PathSegment item={item} isLast={i === items.length - 1} />
        </Fragment>
      ))}
    </nav>
  );
}
