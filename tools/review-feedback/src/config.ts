// Where the review site lives and which token to use. Resolution order, most
// specific first: explicit flags, then env (DOCS_REVIEW_URL / DOCS_REVIEW_API_URL /
// DOCS_REVIEW_TOKEN), then the config file written by `review-feedback login`.
// The file is the path that matters for MCP: a GUI-launched agent (Omnigent,
// Claude desktop) starts the server without the user's shell env.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredConfig {
  /** Review site origin, e.g. https://review.example.com. */
  url?: string;
  /** API base when it isn't `<url>/api` (local dev: http://localhost:8787). */
  apiUrl?: string;
  /** Personal access token (`dfr_…`). */
  token?: string;
}

export interface ResolvedConfig {
  url?: string;
  apiUrl: string;
  token?: string;
}

export class ConfigError extends Error {}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "docs-factory", "review-feedback.json");
}

export function readStoredConfig(path = configPath()): StoredConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
  } catch {
    throw new ConfigError(
      `unreadable config at ${path}; delete it and run \`review-feedback login\``,
    );
  }
}

export function writeStoredConfig(config: StoredConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // writeFileSync's mode applies only on create; tighten an existing file too.
  chmodSync(path, 0o600);
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

export function resolveConfig(
  flags: StoredConfig = {},
  env: NodeJS.ProcessEnv = process.env,
  stored: StoredConfig = readStoredConfig(),
): ResolvedConfig {
  const url = flags.url ?? env.DOCS_REVIEW_URL ?? stored.url;
  // Prod serves the API same-origin under /api (a Vercel rewrite to the Function).
  const apiUrl =
    flags.apiUrl ??
    env.DOCS_REVIEW_API_URL ??
    stored.apiUrl ??
    (url ? `${trimSlash(url)}/api` : "");
  if (!apiUrl) {
    throw new ConfigError(
      "no review site configured; run `review-feedback login --url <review site>` " +
        "or set DOCS_REVIEW_URL",
    );
  }
  const token = flags.token ?? env.DOCS_REVIEW_TOKEN ?? stored.token;
  return { url: url && trimSlash(url), apiUrl: trimSlash(apiUrl), token };
}
