import { Link, useLocation } from "react-router-dom";
import { docNav } from "../../sidebar";
import { useSidebar } from "./Shell";

interface DocsSidebarProps {
  activeProject?: string;
  activeBucket?: string;
  activeSlug?: string;
}

export default function DocsSidebar({
  activeProject,
  activeBucket,
  activeSlug,
}: DocsSidebarProps) {
  const location = useLocation();
  const { mobileOpen, setMobileOpen } = useSidebar();

  const isActive = (href: string) => location.pathname === href;

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Docs navigation">
        <div className="sidebar-inner">
          <Link to="/docs" className="sidebar-home" onClick={() => setMobileOpen(false)}>
            Documentation
          </Link>
          {docNav.map((group) => (
            <section key={group.project} className="sidebar-section">
              <h2 className="sidebar-project">{group.projectLabel}</h2>
              {group.buckets.map((bucket) => (
                <div key={bucket.bucket} className="sidebar-bucket">
                  <h3
                    className={
                      activeProject === group.project && activeBucket === bucket.bucket
                        ? "sidebar-bucket-label active"
                        : "sidebar-bucket-label"
                    }
                  >
                    {bucket.label}
                  </h3>
                  <ul className="sidebar-links">
                    {bucket.items.map((item) => {
                      const active =
                        activeSlug === item.slug &&
                        activeProject === item.project &&
                        activeBucket === item.bucket;
                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            className={active || isActive(item.href) ? "sidebar-link active" : "sidebar-link"}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setMobileOpen(false)}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
