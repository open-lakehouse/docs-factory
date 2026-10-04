import { ArrowRight, Blocks, Database, type LucideIcon, Server } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import CodeCopyButton from "../components/CodeCopyButton";
import {
  DuckDBIcon,
  PandasIcon,
  PolarsIcon,
  PythonIcon,
  SparkIcon,
} from "../components/EngineIcons";
import Shell from "../components/layout/Shell";
import { SOCIAL } from "../components/SocialIcons";
import { UnityCatalogIcon } from "../components/UnityCatalogIcon";
import { type NavItem, site } from "../site";

// The home page is curated, but by route only: an entry whose page this emit
// didn't publish drops out, so a draft-free build never links to a 404.
const routes = new Map<string, string>();
const collect = (items: NavItem[]) => {
  for (const item of items) {
    if (item.kind === "section") collect(item.items);
    else if (!routes.has(item.route)) routes.set(item.route, item.label);
  }
};
collect(site.nav);
for (const page of site.pages) if (!routes.has(page.route)) routes.set(page.route, page.title);
for (const api of site.apis) routes.set(api.route, api.title);
if (site.apiIndex) routes.set(site.apiIndex, "REST API reference");

interface Entry {
  route: string;
  label?: string;
}

function resolve(entries: Entry[]): { route: string; label: string }[] {
  return entries.flatMap(({ route, label }) => {
    const title = routes.get(route);
    return title ? [{ route, label: label ?? title }] : [];
  });
}

// Mirrors the getting-started tutorial's first steps.
const QUICKSTART = [
  "curl -L https://github.com/open-lakehouse/docs-factory/archive/refs/heads/main.tar.gz \\",
  "  | tar -xz --strip-components=1 docs-factory-main/envs",
  "cd envs/unitycatalog && docker compose up -d --wait",
  "docker exec unitycatalog bin/uc catalog list",
];

const PATHS: { title: string; blurb: string; Icon: LucideIcon; links: Entry[] }[] = [
  {
    title: "Use Unity Catalog",
    blurb: "Create catalogs, tables, and volumes, and query them from your engine.",
    Icon: Database,
    links: [
      { route: "/tutorials/python-client" },
      { route: "/how-to/manage-catalogs-and-schemas" },
      { route: "/tutorials/managed-delta-table" },
    ],
  },
  {
    title: "Operate a server",
    blurb: "Persist metadata in PostgreSQL and connect the catalog to cloud storage.",
    Icon: Server,
    links: [
      { route: "/how-to/configure-backend-db" },
      { route: "/how-to/configure-aws-storage" },
      { route: "/how-to/managed-storage-s3" },
    ],
  },
  {
    title: "Build an integration",
    blurb: "Talk to the catalog from your own code through the clients and REST APIs.",
    Icon: Blocks,
    links: [
      { route: "/tutorials/python-client", label: "Python client" },
      { route: "/reference/api/catalog" },
      { route: "/reference/api/delta" },
    ],
  },
];

const ENGINES: (Entry & { icons: ComponentType<SVGProps<SVGSVGElement>>[] })[] = [
  { route: "/how-to/configure-spark", label: "Apache Spark", icons: [SparkIcon] },
  { route: "/how-to/duckdb", label: "DuckDB", icons: [DuckDBIcon] },
  { route: "/how-to/python-dataframes", label: "Polars & pandas", icons: [PolarsIcon, PandasIcon] },
  { route: "/tutorials/python-client", label: "Python client", icons: [PythonIcon] },
];

const KINDS: (Entry & { blurb: string })[] = [
  {
    route: "/tutorials/getting-started",
    label: "Tutorials",
    blurb: "Learn by building, step by step.",
  },
  {
    route: "/how-to/run-local-server",
    label: "How-to guides",
    blurb: "Recipes for one task each.",
  },
  { route: "/explanation/uc-basics", label: "Concepts", blurb: "How the catalog works and why." },
  {
    route: "/reference/features-and-limitations",
    label: "Reference",
    blurb: "Supported features and known issues.",
  },
  { route: "/reference/api", label: "REST API", blurb: "Every endpoint, with request samples." },
];

export default function HomePage() {
  const [start] = resolve([{ route: "/tutorials/getting-started" }]);
  const [intro] = resolve([{ route: "/explanation/what-is-unity-catalog" }]);
  const engines = ENGINES.flatMap(({ icons, ...entry }) =>
    resolve([entry]).map((e) => ({ ...e, icons })),
  );
  const [allEngines] = resolve([{ route: "/reference/clients-and-engines" }]);
  const kinds = KINDS.filter((k) => routes.has(k.route));
  return (
    <Shell>
      <section className="hero">
        <UnityCatalogIcon className="hero-mark" aria-hidden="true" />
        <h1>{site.title}</h1>
        <p className="lead">
          The open catalog for your tables, volumes, functions, and models. Govern data once and
          query it from Spark, DuckDB, Python, and more.
        </p>
        <div className="hero-actions">
          {start && (
            <Link to={start.route} className="button button-primary">
              Create your first catalog <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
          {intro && (
            <Link to={intro.route} className="button">
              What is Unity Catalog?
            </Link>
          )}
        </div>
      </section>

      <section className="home-block" aria-labelledby="home-quickstart">
        <h2 id="home-quickstart" className="home-heading">
          Run it locally in a minute
        </h2>
        <p className="home-sub">
          Needs only Docker. This starts a server on <code>localhost:8080</code> with two sample
          catalogs and lists them.
        </p>
        <div className="terminal">
          <div className="terminal-head">
            <span className="terminal-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>~</span>
          </div>
          <pre className="terminal-body">
            {QUICKSTART.map((line) => (
              <span key={line} className="terminal-line">
                {line.startsWith(" ") ? "  " : <span className="prompt">$ </span>}
                {line.trimStart()}
                {"\n"}
              </span>
            ))}
          </pre>
          <CodeCopyButton code={QUICKSTART.join("\n")} />
        </div>
        {start && (
          <p className="home-next">
            Next: <Link to={start.route}>{start.label}</Link> walks through these steps and builds a
            table of your own.
          </p>
        )}
      </section>

      <section className="home-block" aria-labelledby="home-paths">
        <h2 id="home-paths" className="home-heading">
          Choose your path
        </h2>
        <div className="path-grid">
          {PATHS.map(({ title, blurb, Icon, links }) => {
            const resolved = resolve(links);
            if (!resolved.length) return null;
            return (
              <section key={title} className="path-card">
                <Icon className="path-icon" size={20} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{blurb}</p>
                <ul>
                  {resolved.map((link) => (
                    <li key={link.route}>
                      <Link to={link.route}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>

      {engines.length > 0 && (
        <section className="home-block" aria-labelledby="home-engines">
          <h2 id="home-engines" className="home-heading">
            Connect your engine
          </h2>
          <div className="tile-grid">
            {engines.map((e) => (
              <Link key={e.route} to={e.route} className="tile">
                <span className="tile-label">
                  <span className="tile-icons">
                    {e.icons.map((Icon) => (
                      <Icon key={Icon.name} width={18} height={18} aria-hidden="true" />
                    ))}
                  </span>
                  {e.label}
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
            {allEngines && (
              <Link to={allEngines.route} className="tile tile-muted">
                All engines
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="home-block" aria-labelledby="home-kinds">
        <h2 id="home-kinds" className="home-heading">
          Browse the docs
        </h2>
        <div className="kind-grid">
          {kinds.map((k) => (
            <Link key={k.route} to={k.route} className="kind-tile">
              <strong>{k.label}</strong>
              <span>{k.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="home-community">
        <span>Questions or feedback?</span>
        {SOCIAL.map(({ label, href, Icon }) => (
          <a key={label} href={href} className="chip">
            <Icon width={13} height={13} aria-hidden="true" />
            {label}
          </a>
        ))}
      </footer>
    </Shell>
  );
}
