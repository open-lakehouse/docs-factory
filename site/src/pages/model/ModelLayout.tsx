// The Model section (/model/*): the estate's LikeC4 model and what the docs
// pipeline derives from it. Reviewer-only, like /plan; the gate lives here so
// every page inherits it.
import { Link, NavLink, Outlet } from "react-router-dom";
import Shell from "../../components/layout/Shell";
import { useAuth } from "../../lib/auth-context";
import { MODEL_SECTIONS, modelSectionHref } from "./sections";

export default function ModelLayout() {
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
      <div className="plan-layout model-layout">
        <nav className="plan-nav" aria-label="Model">
          {MODEL_SECTIONS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={modelSectionHref(path)}
              end={path === ""}
              className={({ isActive }) => (isActive ? "plan-nav-item active" : "plan-nav-item")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="plan-body model-body">
          <Outlet />
        </div>
      </div>
    </Shell>
  );
}
