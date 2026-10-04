// `review-feedback login`: a browser loopback flow. We listen on an ephemeral
// 127.0.0.1 port, open <site>/cli-auth?port&state, and the site (after GitHub
// sign-in and consent) redirects the freshly minted token back to us. `state`
// ties the callback to this run, so another local page can't plant a token.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { hostname } from "node:os";

const TIMEOUT_MS = 5 * 60_000;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // The URL is printed too; the user can open it by hand.
  }
}

const page = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>review-feedback</title>` +
  `<body style="font-family:system-ui;margin:4rem auto;max-width:28rem">${msg}</body>`;

/** Resolve to the token from the site's redirect, or reject on timeout/mismatch. */
export function browserLogin(
  siteUrl: string,
  log: (s: string) => void,
  open: (url: string) => void = openBrowser,
): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const token = url.searchParams.get("token") ?? "";
      if (url.searchParams.get("state") !== state || !token.startsWith("dfr_")) {
        res
          .writeHead(400, { "content-type": "text/html" })
          .end(page("Login failed: bad callback."));
        return;
      }
      res
        .writeHead(200, { "content-type": "text/html" })
        .end(page("<h2>Logged in</h2><p>You can close this tab and return to the terminal.</p>"));
      clearTimeout(timer);
      server.close();
      resolve(token);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("login timed out after 5 minutes"));
    }, TIMEOUT_MS);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const q = new URLSearchParams({
        port: String(port),
        state,
        name: `review-feedback on ${hostname()}`,
      });
      const url = `${siteUrl.replace(/\/+$/, "")}/cli-auth?${q}`;
      log(`Opening ${url}\nIf no browser opens, visit that URL to continue.`);
      open(url);
    });
  });
}
