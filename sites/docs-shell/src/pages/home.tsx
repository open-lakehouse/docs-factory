// Building blocks for a site's curated home page (src/brand/HomePage.tsx). The
// curation is by route only: an entry whose page this emit didn't publish drops
// out, so a draft-free build never links to a 404.
import { brand } from "@brand/brand";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Link } from "react-router-dom";
import CodeCopyButton from "../components/CodeCopyButton";
import { type NavItem, site } from "../site";

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

export interface Entry {
  route: string;
  label?: string;
}

export interface Resolved {
  route: string;
  label: string;
}

export function resolve(entries: Entry[]): Resolved[] {
  return entries.flatMap(({ route, label }) => {
    const title = routes.get(route);
    return title ? [{ route, label: label ?? title }] : [];
  });
}

/** A published page's environment commands, or none. */
export function environmentCommands(route: string): string[] {
  return site.pages.find((page) => page.route === route)?.environment?.commands ?? [];
}

export function Hero({
  Logo,
  lead,
  actions,
}: {
  Logo: ComponentType<SVGProps<SVGSVGElement>>;
  lead: ReactNode;
  /** The first action is the primary button. */
  actions: (Resolved | undefined)[];
}) {
  const shown = actions.filter((a): a is Resolved => Boolean(a));
  return (
    <section className="hero">
      <h1>
        <Logo className="hero-mark" aria-hidden="true" />
        {site.title}
      </h1>
      <p className="lead">{lead}</p>
      <div className="hero-actions">
        {shown.map((a, i) => (
          <Link key={a.route} to={a.route} className={i === 0 ? "button button-primary" : "button"}>
            {a.label}
            {i === 0 && (
              <>
                {" "}
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function QuickStart({
  title,
  intro,
  commands,
  next,
}: {
  title: string;
  intro: ReactNode;
  commands: string[];
  next?: ReactNode;
}) {
  if (!commands.length) return null;
  return (
    <section className="home-block" aria-labelledby="home-quickstart">
      <h2 id="home-quickstart" className="home-heading">
        {title}
      </h2>
      <p className="home-sub">{intro}</p>
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
          {commands.map((line) => (
            <span key={line} className="terminal-line">
              {line.startsWith(" ") ? "  " : <span className="prompt">$ </span>}
              {line.trimStart()}
              {"\n"}
            </span>
          ))}
        </pre>
        <CodeCopyButton code={commands.join("\n")} />
      </div>
      {next && <p className="home-next">{next}</p>}
    </section>
  );
}

export interface Path {
  title: string;
  blurb: string;
  Icon: LucideIcon;
  links: Entry[];
}

export function Paths({ paths }: { paths: Path[] }) {
  return (
    <section className="home-block" aria-labelledby="home-paths">
      <h2 id="home-paths" className="home-heading">
        Choose your path
      </h2>
      <div className="path-grid">
        {paths.map(({ title, blurb, Icon, links }) => {
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
  );
}

export type Engine = Entry & { icons: ComponentType<SVGProps<SVGSVGElement>>[] };

export function Engines({
  title,
  engines,
  all,
}: {
  title: string;
  engines: Engine[];
  /** The page that lists every engine, shown as a last, muted tile. */
  all?: string;
}) {
  const shown = engines.flatMap(({ icons, ...entry }) =>
    resolve([entry]).map((e) => ({ ...e, icons })),
  );
  const [allEngines] = all ? resolve([{ route: all }]) : [];
  if (!shown.length) return null;
  return (
    <section className="home-block" aria-labelledby="home-engines">
      <h2 id="home-engines" className="home-heading">
        {title}
      </h2>
      <div className="tile-grid">
        {shown.map((e) => (
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
  );
}

export type Kind = Entry & { blurb: string };

export function Kinds({ kinds }: { kinds: Kind[] }) {
  const shown = kinds.filter((k) => routes.has(k.route));
  if (!shown.length) return null;
  return (
    <section className="home-block" aria-labelledby="home-kinds">
      <h2 id="home-kinds" className="home-heading">
        Browse the docs
      </h2>
      <div className="kind-grid">
        {shown.map((k) => (
          <Link key={k.route} to={k.route} className="kind-tile">
            <strong>{k.label}</strong>
            <span>{k.blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Community() {
  return (
    <footer className="home-community">
      <span>Questions or feedback?</span>
      {brand.social.map(({ label, href, Icon }) => (
        <a key={label} href={href} className="chip">
          <Icon width={13} height={13} aria-hidden="true" />
          {label}
        </a>
      ))}
    </footer>
  );
}
