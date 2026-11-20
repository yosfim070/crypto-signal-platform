import handler from "vinext/server/fetch-handler";
import { getConfig } from "../src/lib/config";
import { scanMarket, trackSignals } from "../src/lib/engine/runner";

type HyperdriveBinding = { connectionString: string };
type Env = { HYPERDRIVE: HyperdriveBinding };

declare global {
  var __cryptoSignalHyperdrive: HyperdriveBinding | undefined;
}

function attachBindings(env: Env) {
  globalThis.__cryptoSignalHyperdrive = env.HYPERDRIVE;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    attachBindings(env);
    return handler.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    attachBindings(env);

    const job = (async () => {
      // Track open signals every minute. Run the market scanner every five
      // minutes, respecting the engine-enabled setting in the admin panel.
      if (controller.cron === "*/5 * * * *") {
        const config = await getConfig();
        if (config.engine.engineEnabled) await scanMarket();
      }
      await trackSignals();
    })();

    ctx.waitUntil(
      job.catch((error) => {
        console.error("[scheduled-engine]", error);
      }),
    );
  },
};
