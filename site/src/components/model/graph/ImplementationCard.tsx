// An implementation at a glance: what it is, how its cells stand, how much of
// each spec it answers, and the paths the model lets it take part in.
import { Box, HardDrive, Library, type LucideIcon, Puzzle, Server, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CompatCoverageCounts } from "../../../compat";
import { catalog } from "../../../estate";
import { elementSummary, likec4model } from "../../../explain";
import { answered, type ImplementationProfile } from "../../../lib/estate-graph";
import { type Brand, BrandIcon, LANGUAGE_BRAND } from "./brand-icons";
import { BucketBar, CoverageRing, ElementRef, implHref, specHref } from "./primitives";

const KIND_ICONS: Record<string, LucideIcon> = {
  service: Server,
  library: Library,
  client: Terminal,
  infra: HardDrive,
  extension: Puzzle,
};

/** Metadata key → where the implementation installs from (specification.likec4). */
const REGISTRIES: {
  key: string;
  label: string;
  icon: Brand | LucideIcon;
  href: (v: string) => string | null;
}[] = [
  { key: "pypi", label: "PyPI", icon: "pypi", href: (n) => `https://pypi.org/project/${n}/` },
  { key: "crate", label: "crates.io", icon: Box, href: (n) => `https://crates.io/crates/${n}` },
  {
    key: "maven",
    label: "Maven Central",
    icon: "apachemaven",
    href: (c) => `https://central.sonatype.com/artifact/${c.replace(":", "/")}`,
  },
  { key: "npm", label: "npm", icon: "npm", href: (n) => `https://www.npmjs.com/package/${n}` },
  // The element's own link already points at the extension's docs.
  { key: "duckdbExtension", label: "DuckDB extension", icon: "duckdb", href: () => null },
];

function FactIcon({ icon, title }: { icon: Brand | LucideIcon; title: string }) {
  if (typeof icon === "string")
    return <BrandIcon brand={icon} title={title} className="impl-fact-icon" />;
  const Icon = icon;
  return (
    <Icon className="impl-fact-icon" role="img" aria-label={title}>
      <title>{title}</title>
    </Icon>
  );
}

export const isExtension = (id: string) =>
  likec4model.findElement(id)?.tags.includes("extension") ?? false;

/** The extensions a host integrates, whose support its own columns count. */
export const extensionsOf = (id: string) =>
  [...(likec4model.findElement(id)?.outgoing() ?? [])]
    .filter((r) => r.kind === "integrates" && isExtension(String(r.target.id)))
    .map((r) => String(r.target.id));

/** The hosts an extension loads into. */
export const hostsOf = (id: string) =>
  [...(likec4model.findElement(id)?.incoming() ?? [])]
    .filter((r) => r.kind === "integrates")
    .map((r) => String(r.source.id));

export function ImplementationIdentity({ id, href }: { id: string; href?: string }) {
  const el = likec4model.findElement(id);
  if (!el) return <code>{id}</code>;
  const meta = el.getMetadata();
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const repo = str("sourceRepo");
  const language = str("language");
  const license = str("license");
  const maturity = str("maturity");
  const links: ReactNode[] = [];
  if (repo)
    links.push(
      <a key="repo" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">
        <FactIcon icon="github" title={`GitHub: ${repo}`} />
      </a>,
    );
  for (const r of REGISTRIES) {
    const value = str(r.key);
    if (!value) continue;
    const icon = <FactIcon icon={r.icon} title={`${r.label}: ${value}`} />;
    const to = r.href(value);
    links.push(
      to ? (
        <a key={r.key} href={to} target="_blank" rel="noreferrer">
          {icon}
        </a>
      ) : (
        <span key={r.key} className="impl-fact-named">
          {icon}
          <code>{value}</code>
        </span>
      ),
    );
  }
  return (
    <div className="impl-identity">
      {el.icon?.startsWith("http") ? (
        <img src={el.icon} alt="" className="impl-icon" />
      ) : (
        <span className="impl-icon impl-icon-blank" aria-hidden="true">
          {el.title.slice(0, 1)}
        </span>
      )}
      <div>
        <p className="impl-title">
          {href ? (
            <Link to={href} className="graph-link">
              {el.title}
            </Link>
          ) : (
            el.title
          )}
        </p>
        <p className="impl-facts">
          {el.tags
            .filter((t) => KIND_ICONS[t])
            .map((t) => (
              <FactIcon key={t} icon={KIND_ICONS[t]} title={t} />
            ))}
          {language &&
            (LANGUAGE_BRAND[language] ? (
              <FactIcon icon={LANGUAGE_BRAND[language]} title={language} />
            ) : (
              <span>{language}</span>
            ))}
          {license && <span>{license}</span>}
          {maturity && <span className="impl-maturity">{maturity}</span>}
          {links}
        </p>
      </div>
    </div>
  );
}

/** The best answered coverage per spec × role, across the projects measuring it. */
export function headlineCoverage(profile: ImplementationProfile) {
  const best = new Map<string, { spec: string; role: string; counts: CompatCoverageCounts }>();
  for (const c of profile.coverage)
    for (const [role, counts] of Object.entries(c.roles)) {
      const key = `${c.spec}:${role}`;
      const prev = best.get(key);
      if (!prev || answered(counts).answered > answered(prev.counts).answered)
        best.set(key, { spec: c.spec, role, counts });
    }
  return [...best.values()].filter((b) => answered(b.counts).total > 0);
}

export const specRoleLabel = (spec: string, role: string) =>
  `${catalog.specs[spec]?.title ?? spec} ${role}`;

export default function ImplementationCard({
  profile,
  compact = false,
}: {
  profile: ImplementationProfile;
  compact?: boolean;
}) {
  const el = likec4model.findElement(profile.id);
  const summary = el ? elementSummary(el) : "";
  const rings = headlineCoverage(profile);
  const paths = [...new Set(profile.paths.map((p) => `${p.path}:${p.role}`))];
  const blockedJourneys = new Set(profile.blockedBy.flatMap((b) => b.journeys));
  const extensions = extensionsOf(profile.id);
  return (
    <article className={compact ? "impl-card is-compact" : "impl-card"}>
      {!compact && <ImplementationIdentity id={profile.id} href={implHref(profile.id)} />}
      {summary && !compact && <p className="impl-summary">{summary}</p>}
      <BucketBar counts={profile.counts} />
      {extensions.length > 0 && (
        <p className="impl-extensions">
          <span className="muted">Extensions</span>
          {extensions.map((x) => (
            <ElementRef key={x} id={x} />
          ))}
        </p>
      )}
      {rings.length > 0 && (
        <div className="impl-rings">
          {rings.map((r) => (
            <CoverageRing
              key={`${r.spec}:${r.role}`}
              counts={r.counts}
              label={specRoleLabel(r.spec, r.role)}
              to={`${specHref(r.spec)}?impl=${encodeURIComponent(profile.id)}`}
            />
          ))}
        </div>
      )}
      {paths.length > 0 && (
        <p className="impl-paths">
          {paths.map((p) => {
            const [path, role] = p.split(":");
            return (
              <span key={p} className="graph-path" title={`Can be the ${role} on ${path}`}>
                {path} · {role}
              </span>
            );
          })}
        </p>
      )}
      {(profile.facts.length > 0 || blockedJourneys.size > 0) && (
        <p className="impl-facts-line">
          {profile.facts.length > 0 && (
            <span className="compat-missing">
              Doesn&apos;t serve {profile.facts.flatMap((f) => f.obligations).length} obligations
            </span>
          )}
          {blockedJourneys.size > 0 && (
            <span className="compat-blocked">Blocked on {blockedJourneys.size} journeys</span>
          )}
        </p>
      )}
    </article>
  );
}
