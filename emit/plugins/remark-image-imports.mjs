/**
 * remark-image-imports — import each post-local image and reference it by
 * binding, for an MDX target whose bundler doesn't resolve a Markdown image URL
 * (openlakehouse.io's Vite build: `![](./flow.svg)` would stay a literal URL the
 * SPA route can't serve). Each `./<file>` image becomes `import img0 from
 * "./<file>"`; a standalone one becomes the site's `<Figure src={img0} alt>`, an
 * inline one an `<img>`.
 *
 * Runs after remark-images-md, which has already made local URLs `./<file>`.
 */
const isPostLocal = (node) => node?.type === "image" && node.url?.startsWith("./");

/** One `mdxjsEsm` node importing every `[source, name]` default. */
function importsNode(pairs) {
  return {
    type: "mdxjsEsm",
    value: pairs
      .map(([source, name]) => `import ${name} from ${JSON.stringify(source)};`)
      .join("\n"),
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: pairs.map(([source, name]) => ({
          type: "ImportDeclaration",
          specifiers: [{ type: "ImportDefaultSpecifier", local: { type: "Identifier", name } }],
          source: { type: "Literal", value: source, raw: JSON.stringify(source) },
        })),
      },
    },
  };
}

function element(type, name, binding, alt) {
  return {
    type,
    name,
    attributes: [
      {
        type: "mdxJsxAttribute",
        name: "src",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: binding,
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [
                { type: "ExpressionStatement", expression: { type: "Identifier", name: binding } },
              ],
            },
          },
        },
      },
      { type: "mdxJsxAttribute", name: "alt", value: alt ?? "" },
    ],
    children: [],
  };
}

export default function remarkImageImports({ figure = "Figure" } = {}) {
  return (tree) => {
    const bindings = new Map();
    const bind = (url) => {
      if (!bindings.has(url)) bindings.set(url, `img${bindings.size}`);
      return bindings.get(url);
    };
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (
          child.type === "paragraph" &&
          child.children?.length === 1 &&
          isPostLocal(child.children[0])
        ) {
          const image = child.children[0];
          return element("mdxJsxFlowElement", figure, bind(image.url), image.alt);
        }
        if (isPostLocal(child))
          return element("mdxJsxTextElement", "img", bind(child.url), child.alt);
        walk(child);
        return child;
      });
    };
    walk(tree);
    if (!bindings.size) return;
    const at = tree.children[0]?.type === "yaml" ? 1 : 0;
    tree.children.splice(at, 0, importsNode([...bindings]));
  };
}
