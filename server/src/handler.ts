// Neon Function entrypoint. A Neon Function is any module exporting a
// `fetch(request) => Response`; Hono's `app.fetch` is exactly that shape, so the
// same app runs unchanged here and in the local dev server. The app is built
// once at module load (top-level await) and reused across warm invocations.
// See https://neon.com/docs/compute/functions/overview
import { createApp } from "./app.js";

const app = await createApp();

export default {
  fetch: app.fetch,
};
