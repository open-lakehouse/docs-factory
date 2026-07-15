import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";

// Map the elements a draft emits to lightly-styled components. Diagram images
// carrying a `likec4=` title are already rewritten to <LikeC4View> by
// remark-likec4-views; anything reaching `img` here is a plain static image
// (a D2 SVG, a screenshot) and stays static — the degradation path.
//
// Code blocks and journeys no longer need a component override here:
// remark-code-block turns every fence into a <CodeBlock> element (client-side
// Shiki) and remark-journey/remark-callouts emit their own components, all
// imported directly into the compiled MDX.
const components = {
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} loading="lazy" style={{ maxWidth: "100%", height: "auto" }} />
  ),
};

export default function MdxProvider({ children }: { children: ReactNode }) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
