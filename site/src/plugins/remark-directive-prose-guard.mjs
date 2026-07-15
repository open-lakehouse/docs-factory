/**
 * remark-directive-prose-guard — undo remark-directive's false positives in
 * prose, keeping ONLY the container (`:::name`) directives this repo actually
 * uses (today: `:::journey`).
 *
 * remark-directive parses three syntaxes: container (`:::name`), leaf
 * (`::name`), and *text* (`:name`). The text form is the problem: ordinary prose
 * colons get eaten. `**1:1**`, `**8080:8080**`, `16:9` all parse `:1`, `:8080`,
 * `:9` as text directives and render a stray empty <div> mid-sentence (a real
 * hydration bug — a <div> inside a <p>). This post is full of such colons
 * (docker port maps, 1:1 bind mounts).
 *
 * We never author leaf or text directives, so any `textDirective` /
 * `leafDirective` node is a false positive. This plugin, run immediately AFTER
 * remark-directive, reconstructs each such node's original source text and
 * replaces it with a plain text node — leaving container directives (our
 * journeys) untouched. Prose colons round-trip losslessly.
 */

/** Reconstruct the literal source of a mis-parsed text/leaf directive. */
function reconstruct(node) {
  const marker = node.type === "leafDirective" ? "::" : ":";
  let out = marker + (node.name ?? "");
  // A `[label]` part, if micromark captured children as the label.
  const label = (node.children ?? []).map((c) => c.value ?? "").join("");
  if (label) out += `[${label}]`;
  // An `{#id .class key=val}` attributes part.
  const attrs = node.attributes ?? {};
  const keys = Object.keys(attrs);
  if (keys.length) {
    const parts = keys.map((k) => {
      if (k === "id") return `#${attrs[k]}`;
      if (k === "class") return attrs[k].split(/\s+/).map((c) => `.${c}`).join(" ");
      return `${k}=${attrs[k]}`;
    });
    out += `{${parts.join(" ")}}`;
  }
  return out;
}

export default function remarkDirectiveProseGuard() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "textDirective" || child.type === "leafDirective") {
          node.children[i] = { type: "text", value: reconstruct(child) };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
