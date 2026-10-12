import type { Brand } from "@/brand";
import { GitHubIcon, RedditIcon, SlackIcon } from "@/components/SocialIcons";

const github = "https://github.com/unitycatalog/unitycatalog";

export const brand: Brand = {
  wordmark: "unity catalog",
  statusLabel: "unity catalog oss",
  github,
  social: [
    { label: "GitHub", href: github, Icon: GitHubIcon },
    { label: "Slack", href: "https://go.unitycatalog.io/slack", Icon: SlackIcon },
    { label: "Reddit", href: "https://www.reddit.com/r/UnityCatalog/", Icon: RedditIcon },
  ],
};
