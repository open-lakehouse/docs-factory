import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";
import { Pre } from "./components/code-block";

const components = {
  pre: Pre,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} loading="lazy" style={{ maxWidth: "100%", height: "auto" }} />
  ),
};

export default function MdxProvider({ children }: { children: ReactNode }) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
