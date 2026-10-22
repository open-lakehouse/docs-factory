// What a site's src/brand/brand.ts supplies; the shell reads it as `@brand/brand`.
// The site's logo (`@brand/Logo`, default export), accent tokens
// (`@brand/theme.css`), and home page (`@brand/HomePage`) complete the brand.
import type { ComponentType, SVGProps } from "react";

export interface SocialLink {
  label: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface Brand {
  /** Lowercase product name beside the logo in the topbar. */
  wordmark: string;
  /** The status-bar label. */
  statusLabel: string;
  /** The project repository, linked from the status bar. */
  github: string;
  /** The foundation claim in the status bar, linked to the foundation. */
  foundation: { label: string; href: string };
  /** Topbar icons and the home page's community chips, in order. */
  social: SocialLink[];
}
