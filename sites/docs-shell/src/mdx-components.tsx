import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";
import { Pre } from "./components/code-block";

const components = {
  pre: Pre,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/a11y/useAltText: alt comes from the Markdown source via props.
    <img {...props} loading="lazy" />
  ),
};

export default function MdxComponents({ children }: { children: ReactNode }) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
