import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  accountId: "2e6ae355cdc86fd94f7f3795cde543ce",
  worker: {
    name: "crypto-signal-platform",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-20",
    env: {
      HYPERDRIVE: bindings.hyperdrive({
        id: "42cd24d6c9a04236aa8c0039c7ca2637",
      }),
    },
    // Cron schedules are production-only. Cloudflare Preview uploads
    // reject trigger definitions, and Preview does not execute scheduled().
    ...(isPreview
      ? {}
      : {
          triggers: [
            triggers.scheduled({ schedule: "*/1 * * * *" }),
          ],
        }),
    observability: {
      enabled: true,
      traces: { enabled: true },
    },
  },
}));
