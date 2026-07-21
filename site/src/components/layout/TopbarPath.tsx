import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useRouteBreadcrumbs } from "../../lib/route-breadcrumbs";
import type { BreadcrumbItemData } from "./Breadcrumbs";
import { CrumbDropdown } from "./Breadcrumbs";

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

export default function TopbarPath() {
  const items = useRouteBreadcrumbs();

  return (
    <nav className="topbar-crumbtrail" aria-label="Path">
      <Link to="/" className="topbar-path-root">
        ~/open-lakehouse
      </Link>
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
