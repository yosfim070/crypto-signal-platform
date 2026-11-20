import { getConfig } from "@/lib/config";
import { getTickers } from "@/lib/market/providers";
import { querySignals } from "@/lib/signalQuery";
import { blendedPnlPct } from "@/lib/trading";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = await getConfig();
    const open = (await querySignals({ status: "active", limit: 200 })).items;
    const closed = (await querySignals({ limit: 12, offset: 0 })).items.filter((s) => s.status !== "active" && s.status !== "stopped");
    let tickers: Record<string, { price: number }> = {};
    let error: string | null = null;
    let source: string | null = null;
    try {
      const t = await getTickers([...new Set(open.map((s) => s.symbol))]);
      tickers = t.tickers;
      source = t.source;
    } catch (e) {
      error = (e as Error).message;
    }
    const size = cfg.engine.positionSizeUsd;
    const trades = open.map((s) => {
      const price = tickers[s.symbol]?.price ?? null;
      const pnlPct = price !== null ? blendedPnlPct(s, price) : null;
      return { signal: s, price, pnlPct, pnlUsd: pnlPct !== null ? (pnlPct / 100) * size : null };
    });
    const totalUsd = trades.reduce((a, t) => a + (t.pnlUsd ?? 0), 0);
    return Response.json({
      trades,
      closed,
      positionSizeUsd: size,
      totalUsd,
      source,
      error,
      serverTime: Date.now(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
