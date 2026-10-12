// The Plan section (/plan/*): what to write next and how far along each project
// is. Reviewer-only; the gate lives here so every section page inherits it.
import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Shell from "../../components/layout/Shell";
import { useAuth } from "../../lib/auth-context";
import { PLAN_SECTIONS, planHref } from "./sections";

export default function PlanLayout() {
  const { isLoading, isAllowlisted } = useAuth();
  if (isLoading) {
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!isAllowlisted) {
    return (
      <Shell>
        <p>
          Not found. <Link to="/">Back home.</Link>
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="plan-layout">
        <nav className="plan-nav" aria-label="Plan">
          {PLAN_SECTIONS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={planHref(path)}
              // The summary is the index route; without `end` it matches every section.
              end={path === ""}
              className={({ isActive }) => (isActive ? "plan-nav-item active" : "plan-nav-item")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="plan-body">
          <Outlet />
        </div>
      </div>
    </Shell>
  );
}

/** Heading + one-line purpose shared by every Plan page. */
export function PlanPage({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="plan-page">
      <header className="plan-page-head">
        <div>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
