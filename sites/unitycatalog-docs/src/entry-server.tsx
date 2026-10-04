import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import App from "./App";
import { preloadRoute, site } from "./site";

/** Every route scripts/prerender.mjs writes an HTML file for. */
export const routes = [
  "/",
  ...site.pages.map((p) => p.route),
  ...site.apis.map((a) => a.route),
  ...(site.apiIndex ? [site.apiIndex] : []),
];

export async function render(url: string): Promise<string> {
  await preloadRoute(url);
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}
