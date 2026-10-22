import { inject } from "@vercel/analytics";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { preloadRoute } from "./site";
import "./styles.css";
import "@brand/theme.css";

// Client-only so the prerendered markup is untouched. The script tracks
// router navigations itself; off Vercel its /_vercel/insights request 404s.
inject();

const root = document.getElementById("root") as HTMLElement;
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Hydration must see the same content the prerender did, so load it first.
// Prerendered pages hydrate; `vite dev` serves the bare shell, so render fresh.
void preloadRoute(window.location.pathname).then(() => {
  if (root.firstElementChild) hydrateRoot(root, app);
  else createRoot(root).render(app);
});
