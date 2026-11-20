import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  // Tailwind v4 is handled by its native Vite plugin. Keep Vite's separate
  // PostCSS import pass disabled so it does not try to resolve
  // @import "tailwindcss" as a filesystem path.
  css: { postcss: { plugins: [] } },
  plugins: [
    tailwindcss(),
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
