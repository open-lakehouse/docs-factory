// An implementation at a glance: what it is, how its cells stand, how much of
// each spec it answers, and the paths the model lets it take part in.
import { Link } from "react-router-dom";
import type { CompatCoverageCounts } from "../../../compat";
import { catalog } from "../../../estate";
import { elementSummary, likec4model } from "../../../explain";
import { answered, type ImplementationProfile } from "../../../lib/estate-graph";
import { BucketBar, CoverageRing, implHref, specHref } from "./primitives";

const KIND_TAGS = ["service", "library", "client", "infra"];

export function ImplementationIdentity({ id, href }: { id: string; href?: string }) {
  const el = likec4model.findElement(id);
  if (!el) return <code>{id}</code>;
  const meta = el.getMetadata();
  const repo = typeof meta.sourceRepo === "string" ? meta.sourceRepo : null;
  const facts = [meta.language, meta.license].filter((v): v is string => typeof v === "string");
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
            .filter((t) => KIND_TAGS.includes(t))
            .map((t) => (
              <span key={t} className="model-tag">
                {t}
              </span>
            ))}
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
          {repo && (
            <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">
              {repo}
            </a>
          )}
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
  return (
    <article className={compact ? "impl-card is-compact" : "impl-card"}>
      {!compact && <ImplementationIdentity id={profile.id} href={implHref(profile.id)} />}
      {summary && !compact && <p className="impl-summary">{summary}</p>}
      <BucketBar counts={profile.counts} />
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
