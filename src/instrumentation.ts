export async function register() {
  // Cloudflare Workers use the scheduled() handler in custom-worker.ts.
  // Keep the interval-based scheduler only for ordinary Node.js deployments
  // and local production runs, never during Next.js build collection.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const isCloudflareWorker = process.env.CF_WORKER === "1";

  if (process.env.NEXT_RUNTIME === "nodejs" && !isBuild && !isCloudflareWorker) {
    const { startScheduler } = await import("@/lib/engine/runner");
    startScheduler();
  }
}
