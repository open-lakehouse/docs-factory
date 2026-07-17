/**
 * remark-callouts-directive-remap — pass callouts THROUGH as `:::` container
 * directives (unflattened), but remap our draft's callout vocabulary onto the
 * target site's supported set.
 *
 * Unlike remark-callouts-md (which flattens `:::tip` → a bold-led blockquote for
 * Google Docs) and unlike the unitycatalog target (which passes `:::` through
 * VERBATIM because its remark handler styles our exact names), the delta.io site's
 * handler (`lib/remarkPlugins.ts`) only styles a fixed set — `note`, `info`,
 * `warning`, `danger`. A draft callout whose name isn't in that set would render as
 * an unstyled `<div>` (or leak), so we rename it to the closest supported name and
 * otherwise leave the directive intact for the site to style.
 *
 *   :::tip        →  :::note      (delta has no "tip"; "note" is its helpful-aside)
 *   :::caution    →  :::danger    (delta has no "caution"; "danger" is its strong warning)
 *   :::info       →  :::info      (supported — unchanged)
 *   :::warning    →  :::warning   (supported — unchanged)
 *   :::note/:::danger             (supported — unchanged)
 *
 * A directive whose name is NOT a callout (e.g. `journey`) is left untouched for
 * its own plugin. Runs after remark-directive + the prose guard; order relative to
 * the journey plugin doesn't matter (it only renames, never restructures).
 */

// Draft callout name → delta.io site-supported name. Names already supported map
// to themselves; anything the site doesn't style is remapped to its closest kin.
const REMAP = {
  tip: "note",
  note: "note",
  info: "info",
  warning: "warning",
  caution: "danger",
  danger: "danger",
};

export default function remarkCalloutsDirectiveRemap() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (const child of node.children) {
        if (child.type === "containerDirective" && REMAP[child.name]) {
          child.name = REMAP[child.name];
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
