// The LikeC4 web component the emitter ships at /likec4/likec4-webcomponent.mjs.
import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "likec4-view": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        "view-id": string;
        "dynamic-variant"?: string;
      };
    }
  }
}
