// Local entrypoint: serve the same Hono app over a Node HTTP server. Run via
// `just server-dev`. Mirrors the Neon Function so what works locally works
// deployed.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const app = await createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `review API (AUTH_MODE=${process.env.AUTH_MODE ?? "anon"}) on http://localhost:${info.port}`,
  );
});
