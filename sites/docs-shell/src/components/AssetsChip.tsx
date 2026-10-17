// The count of asset kinds a diagram node manages, with the kinds in its card.
import { type Concept, conceptHref, externalAttrs } from "./ConceptRef";
import { useHoverCard } from "./useHoverCard";

export function AssetsChip({ assets }: { assets: Concept[] }) {
  const { trigger, popover } = useHoverCard({ interactive: true });
  const label = `${assets.length} asset ${assets.length === 1 ? "kind" : "kinds"}`;

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the card, which describes the count. */}
      <span className="node-assets" tabIndex={0} {...trigger}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2 14 5 8 8 2 5Z" />
          <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
        </svg>
        {assets.length}
      </span>
      {popover(
        "concept-card",
        <>
          <span className="concept-card-kind">Manages {label}</span>
          <ul className="concept-card-assets">
            {assets.map((asset) => {
              const href = conceptHref(asset);
              return (
                <li key={asset.title}>
                  {href ? (
                    <a href={href} {...externalAttrs(href)}>
                      {asset.title}
                    </a>
                  ) : (
                    asset.title
                  )}
                </li>
              );
            })}
          </ul>
        </>,
      )}
    </>
  );
}
