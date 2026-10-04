// Shared pieces of the personal-access-token UI: the scopes the review-feedback
// CLI/MCP asks for, and validation of the CLI's loopback login request.

export const FEEDBACK_SCOPES = ["feedback:read", "feedback:reply"];

export const SCOPE_LABELS: Record<string, string> = {
  "feedback:read": "read drafts and review comments",
  "feedback:reply": "reply to existing threads (never resolve or open new ones)",
};

export interface CliLoginRequest {
  port: number;
  state: string;
  name: string;
}

/**
 * Parse `/cli-auth?port=…&state=…&name=…`. Only a numeric loopback port is
 * accepted, never a URL: the token is handed to `http://127.0.0.1:<port>` and
 * nowhere else, so a crafted link can't redirect a freshly minted token to
 * another host.
 */
export function parseCliLogin(params: URLSearchParams): CliLoginRequest | null {
  const portRaw = params.get("port") ?? "";
  const port = Number(portRaw);
  if (!/^\d+$/.test(portRaw) || port < 1024 || port > 65535) return null;
  const state = params.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(state)) return null;
  const name = (params.get("name") ?? "").trim().slice(0, 100) || "review-feedback CLI";
  return { port, state, name };
}

export function cliCallbackUrl(req: CliLoginRequest, token: string): string {
  const q = new URLSearchParams({ token, state: req.state });
  return `http://127.0.0.1:${req.port}/callback?${q}`;
}
