import { Link, useLocation } from "react-router-dom";
import { explainNav, orphanSpecs, orphanImplementations, explainHref } from "../../explain";
import { useSidebar } from "./Shell";

interface ExplainSidebarProps {
  activeId?: string;
}

export default function ExplainSidebar({ activeId }: ExplainSidebarProps) {
  const location = useLocation();
  const { mobileOpen, setMobileOpen } = useSidebar();

  const isActive = (id: string) =>
    activeId === id || location.pathname === explainHref(id);

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
      <aside
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
        aria-label="Explain navigation"
      >
        <div className="sidebar-inner">
          <Link
            to="/explanation"
            className="sidebar-home"
            onClick={() => setMobileOpen(false)}
          >
            Explanation
          </Link>
          {explainNav.map((cap) => (
            <section key={cap.id} className="sidebar-section">
              <h2
                className={
                  isActive(cap.id) ? "sidebar-project active" : "sidebar-project"
                }
              >
                <Link
                  to={explainHref(cap.id)}
                  className={
                    isActive(cap.id) ? "sidebar-link active" : "sidebar-link"
                  }
                  aria-current={isActive(cap.id) ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {cap.title}
                </Link>
              </h2>
              {cap.specs.length > 0 && (
                <ul className="sidebar-links">
                  {cap.specs.map((spec) => (
                    <li key={spec.id}>
                      <Link
                        to={explainHref(spec.id)}
                        className={
                          isActive(spec.id)
                            ? "sidebar-link active"
                            : "sidebar-link"
                        }
                        aria-current={isActive(spec.id) ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        {spec.title}
                      </Link>
                      {spec.implementations.length > 0 && (
                        <ul className="sidebar-links sidebar-links-nested">
                          {spec.implementations.map((impl) => (
                            <li key={impl.id}>
                              <Link
                                to={explainHref(impl.id)}
                                className={
                                  isActive(impl.id)
                                    ? "sidebar-link active"
                                    : "sidebar-link"
                                }
                                aria-current={isActive(impl.id) ? "page" : undefined}
                                onClick={() => setMobileOpen(false)}
                              >
                                {impl.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {orphanSpecs.length > 0 && (
            <section className="sidebar-section">
              <h2 className="sidebar-project">Other specifications</h2>
              <ul className="sidebar-links">
                {orphanSpecs.map((spec) => (
                  <li key={spec.id}>
                    <Link
                      to={explainHref(spec.id)}
                      className={
                        isActive(spec.id)
                          ? "sidebar-link active"
                          : "sidebar-link"
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      {spec.title}
                    </Link>
                    {spec.implementations.length > 0 && (
                      <ul className="sidebar-links sidebar-links-nested">
                        {spec.implementations.map((impl) => (
                          <li key={impl.id}>
                            <Link
                              to={explainHref(impl.id)}
                              className={
                                isActive(impl.id)
                                  ? "sidebar-link active"
                                  : "sidebar-link"
                              }
                              onClick={() => setMobileOpen(false)}
                            >
                              {impl.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {orphanImplementations.length > 0 && (
            <section className="sidebar-section">
              <h2 className="sidebar-project">Implementations</h2>
              <ul className="sidebar-links">
                {orphanImplementations.map((impl) => (
                  <li key={impl.id}>
                    <Link
                      to={explainHref(impl.id)}
                      className={
                        isActive(impl.id)
                          ? "sidebar-link active"
                          : "sidebar-link"
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      {impl.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
