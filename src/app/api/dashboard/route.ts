import { db } from "@/db";
import { coins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed, getConfig } from "@/lib/config";
import { snapshots, state } from "@/lib/engine/runner";
import { getMarketInfo } from "@/lib/market/coingecko";
import { getTickers } from "@/lib/market/providers";
import { querySignals } from "@/lib/signalQuery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeed();
    const cfg = await getConfig();
    const list = await db.select().from(coins).where(eq(coins.enabled, true)).orderBy(coins.id);
    let tickers = {};
    let source: string | null = null;
    let marketError: string | null = null;
    try {
      const t = await getTickers(list.map((c) => c.symbol));
      tickers = t.tickers;
      source = t.source;
    } catch (e) {
      marketError = (e as Error).message;
    }
    const mi = await getMarketInfo(list);
    const { items } = await querySignals({ limit: 300 });
    return Response.json({
      coins: list.map((c) => ({ symbol: c.symbol, name: c.name })),
      tickers,
      info: mi.info,
      infoError: mi.error,
      signals: items.filter((s) => s.status !== "stopped"),
      snapshots: Object.fromEntries(snapshots),
      system: {
        online: source !== null,
        source,
        marketError,
        engineEnabled: cfg.engine.engineEnabled,
        minConfidence: cfg.engine.minConfidence,
        timeframes: cfg.engine.timeframes,
        scanIntervalSec: cfg.engine.scanIntervalSec,
        lastScanAt: state.lastScanAt || null,
        scanning: state.scanning,
        lastScan: state.lastScan,
      },
      serverTime: Date.now(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
