import { defineConfig } from "vite";
import { docsSiteConfig } from "./shell/vite.base.ts";

export default defineConfig(docsSiteConfig({ root: import.meta.dirname, port: 4323 }));
