import { aiAssist } from "@/lib/ai";
import { analyze } from "@/lib/analysis/engine";
import { getConfig } from "@/lib/config";
import { getCandles } from "@/lib/market/providers";
import { TIMEFRAMES, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; timeframe?: string; question?: string };
  const symbol = (body.symbol ?? "").toUpperCase();
  const tf = body.timeframe as Timeframe;
  if (!/^[A-Z0-9]{2,15}$/.test(symbol) || !TIMEFRAMES.includes(tf)) return Response.json({ error: "ورودی نامعتبر" }, { status: 400 });
  try {
    const cfg = await getConfig();
    const { candles } = await getCandles(symbol, tf, { limit: 300 });
    const a = analyze(symbol, tf, candles, cfg);
    const reply = await aiAssist(a, body.question?.slice(0, 500));
    return Response.json(reply);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
