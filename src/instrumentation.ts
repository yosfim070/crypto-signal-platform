export async function register() {
  // Cloudflare Workers do not provide a persistent process for setInterval.
  // Production engine work is invoked by Cron Triggers in worker/index.ts.
  // Keep instrumentation side-effect free so builds and request startup are safe.
}
