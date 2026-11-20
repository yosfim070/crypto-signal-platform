import { analyze } from "@/lib/analysis/engine";
import { getConfig } from "@/lib/config";
import { getCandles } from "@/lib/market/providers";
import { querySignals } from "@/lib/signalQuery";
import { SOURCE_IDS, TIMEFRAMES, type SourceId, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get("symbol") ?? "DOGE").toUpperCase();
  const tf = (sp.get("tf") ?? "15m") as Timeframe;
  const src = sp.get("source") as SourceId | null;
  if (!/^[A-Z0-9]{2,15}$/.test(symbol)) return Response.json({ error: "نماد نامعتبر" }, { status: 400 });
  if (!TIMEFRAMES.includes(tf)) return Response.json({ error: "تایم‌فریم نامعتبر" }, { status: 400 });
  try {
    const cfg = await getConfig();
    const { candles, source } = await getCandles(symbol, tf, { limit: 300, source: src && SOURCE_IDS.includes(src) ? src : undefined });
    const a = analyze(symbol, tf, candles, cfg);
    const sigs = (await querySignals({ symbol, limit: 40 })).items.filter((s) => s.status !== "stopped");
    return Response.json({
      candles,
      source,
      requestedSource: src,
      signals: sigs,
      analysis: {
        direction: a.direction,
        confidence: a.confidence,
        price: a.price,
        supports: a.supports,
        resistances: a.resistances,
        indicators: a.indicators,
        modules: a.modules,
        plan: a.rejected ? null : a.plan,
        rejected: a.rejected,
        reason: a.reason,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
