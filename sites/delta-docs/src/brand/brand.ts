import type { Brand } from "@/brand";
import { GitHubIcon, LinkedInIcon, SlackIcon, YouTubeIcon } from "@/components/SocialIcons";

const github = "https://github.com/delta-io/delta";

export const brand: Brand = {
  wordmark: "delta lake",
  statusLabel: "delta lake",
  github,
  // The legal form delta.io's footer uses.
  foundation: {
    label: "Delta Lake, a series of LF Projects, LLC",
    href: "https://lfprojects.org/",
  },
  // The go.delta.io short links delta.io itself uses.
  social: [
    { label: "GitHub", href: github, Icon: GitHubIcon },
    { label: "Slack", href: "https://go.delta.io/slack", Icon: SlackIcon },
    { label: "LinkedIn", href: "https://go.delta.io/linkedin", Icon: LinkedInIcon },
    { label: "YouTube", href: "https://go.delta.io/youtube", Icon: YouTubeIcon },
  ],
};
