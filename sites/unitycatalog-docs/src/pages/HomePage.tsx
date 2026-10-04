import { Link } from "react-router-dom";
import CodeCopyButton from "../components/CodeCopyButton";
import Shell from "../components/layout/Shell";
import { UnityCatalogIcon } from "../components/UnityCatalogIcon";
import { type NavItem, site } from "../site";

/** The pages directly under a section, flattening nested sections. */
function pagesIn(items: NavItem[]): { route: string; label: string }[] {
  return items.flatMap((item) => (item.kind === "page" ? [item] : pagesIn(item.items)));
}

// Mirrors the getting-started tutorial's first step: its compose file runs the server.
const QUICKSTART = "docker compose up -d --wait";

export default function HomePage() {
  const sections = site.nav.filter((item) => item.kind === "section");
  const tutorial = site.pages.find((p) => p.diataxis === "tutorial");
  const intro = pagesIn(site.nav)[0];
  return (
    <Shell>
      <section className="hero">
        <UnityCatalogIcon className="hero-mark" aria-hidden="true" />
        <h1>{site.title}</h1>
        {site.tagline && <p className="lead">{site.tagline}</p>}
        <div className="terminal">
          <div className="terminal-head">
            <span className="terminal-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>~/unitycatalog</span>
          </div>
          <pre className="terminal-body">
            <span className="prompt">$</span> {QUICKSTART}
            {"\n"}
            <span className="terminal-ok">{" ✔"}</span>
            <span className="terminal-dim">{" Container unitycatalog  Healthy"}</span>
            {"\n"}
            <span className="prompt">$</span> <span className="cursor" aria-hidden="true" />
          </pre>
          <CodeCopyButton code={QUICKSTART} />
        </div>
        <p className="hero-links">
          {tutorial && (
            <Link to={tutorial.route} className="chip chip-accent">
              get started →
            </Link>
          )}
          {intro && intro.route !== tutorial?.route && (
            <Link to={intro.route} className="chip">
              {intro.label.toLowerCase()}
            </Link>
          )}
          <a href="/llms.txt" className="chip">
            llms.txt for agents
          </a>
        </p>
      </section>
      <div className="section-grid">
        {sections.map((section) => {
          const pages = pagesIn(section.items);
          return (
            <section key={section.label} className="section-card">
              <h2>
                <span>{section.label}</span>
                <span className="section-count">
                  {pages.length} {pages.length === 1 ? "page" : "pages"}
                </span>
              </h2>
              <ul>
                {pages.map((p) => (
                  <li key={p.route}>
                    <Link to={p.route}>{p.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
