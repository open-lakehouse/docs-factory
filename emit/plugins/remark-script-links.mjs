/**
 * remark-script-links — tag a fence quoted from a published script with
 * `script="<url>"`, so the site can link the block to the whole runnable file.
 * Matches on the `srcpath=` remark-code-snippets adds, so run it before
 * remark-strip-source-meta. `scripts` maps repo-relative path → served URL.
 */
const SRCPATH_RE = /\bsrcpath="([^"]*)"/;

export default function remarkScriptLinks({ scripts }) {
  return (tree) => {
    const walk = (node) => {
      if (node.type === "code" && typeof node.meta === "string") {
        const url = scripts.get(SRCPATH_RE.exec(node.meta)?.[1]);
        if (url) node.meta = `${node.meta} script="${url}"`;
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
