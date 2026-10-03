import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import { type NavItem, site } from "../site";

/** The pages directly under a section, flattening nested sections. */
function pagesIn(items: NavItem[]): { route: string; label: string }[] {
  return items.flatMap((item) => (item.kind === "page" ? [item] : pagesIn(item.items)));
}

export default function HomePage() {
  const sections = site.nav.filter((item) => item.kind === "section");
  return (
    <Shell>
      <section className="hero">
        <h1>{site.title}</h1>
        {site.tagline && <p className="lead">{site.tagline}</p>}
      </section>
      <div className="section-grid">
        {sections.map((section) => (
          <section key={section.label} className="section-card">
            <h2>{section.label}</h2>
            <ul>
              {pagesIn(section.items).map((p) => (
                <li key={p.route}>
                  <Link to={p.route}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
