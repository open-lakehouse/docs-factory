import { Link } from "react-router-dom";
import DocsSidebar from "../components/layout/DocsSidebar";
import Shell from "../components/layout/Shell";
import { docNav } from "../sidebar";

export default function DocsIndex() {
  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <DocsSidebar />
        <div className="docs-main">
          <h1>Documentation</h1>
          <p className="muted">
            Engine-neutral reference organized by Diátaxis — explanation, tutorials,
            how-to guides, and reference.
          </p>
          {docNav.map((group) => (
            <section key={group.project} className="nav-section">
              <h2>{group.projectLabel}</h2>
              {group.buckets.map((bucket) => (
                <div key={bucket.bucket} className="nav-bucket">
                  <h3>{bucket.label}</h3>
                  <ul className="draft-list compact">
                    {bucket.items.map((item) => (
                      <li key={item.href}>
                        <Link to={item.href}>{item.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}
