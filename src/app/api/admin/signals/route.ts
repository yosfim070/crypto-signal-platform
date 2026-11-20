import { db } from "@/db";
import { signals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin, unauthorized } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getTickers } from "@/lib/market/providers";
import { notify } from "@/lib/notify";
import { fmtPrice } from "@/lib/format";
import { parseFilters, querySignals } from "@/lib/signalQuery";
import { blendedPnlPct } from "@/lib/trading";
import { TF_MS, TIMEFRAMES, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const f = parseFilters(new URL(req.url).searchParams);
  f.includePending = true;
  return Response.json(await querySignals(f));
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const symbol = String(b.symbol ?? "").toUpperCase();
  const direction = b.direction === "SELL" ? "SELL" : "BUY";
  const tf = b.timeframe as Timeframe;
  const [entry, sl, tp1, tp2, tp3] = ["entry", "stopLoss", "tp1", "tp2", "tp3"].map((k) => Number(b[k]));
  if (!/^[A-Z0-9]{2,15}$/.test(symbol) || !TIMEFRAMES.includes(tf)) return Response.json({ error: "نماد یا تایم‌فریم نامعتبر" }, { status: 400 });
  if (![entry, sl, tp1, tp2, tp3].every((x) => Number.isFinite(x) && x > 0)) return Response.json({ error: "قیمت‌ها نامعتبر است" }, { status: 400 });
  const d = direction === "BUY" ? 1 : -1;
  if (!(d * (entry - sl) > 0 && d * (tp1 - entry) > 0 && d * (tp2 - tp1) > 0 && d * (tp3 - tp2) > 0))
    return Response.json({ error: direction === "BUY" ? "ترتیب باید SL < Entry < TP1 < TP2 < TP3 باشد" : "ترتیب باید TP3 < TP2 < TP1 < Entry < SL باشد" }, { status: 400 });
  const cfg = await getConfig();
  const publish = b.publish !== false;
  const [row] = await db
    .insert(signals)
    .values({
      symbol,
      direction,
      timeframe: tf,
      entry,
      stopLoss: sl,
      currentSl: sl,
      tp1,
      tp2,
      tp3,
      confidence: Math.round(Math.min(100, Math.max(1, Number(b.confidence) || 70))),
      riskReward: Number(((d * (tp2 - entry)) / (d * (entry - sl))).toFixed(2)),
      reason: String(b.reason ?? "").slice(0, 500) || "سیگنال دستی ثبت‌شده توسط مدیر",
      status: publish ? "active" : "pending",
      source: "manual",
      expiresAt: new Date(Date.now() + cfg.engine.expiryCandles * TF_MS[tf]),
    })
    .returning();
  if (publish)
    await notify({
      type: "new",
      title: `🚦 سیگنال دستی ${direction === "BUY" ? "خرید" : "فروش"} ${symbol}/USDT (${tf})`,
      body: `ورود: ${fmtPrice(entry)} | SL: ${fmtPrice(sl)} | TP1: ${fmtPrice(tp1)}`,
      signalId: row.id,
    });
  return Response.json({ ok: true, id: row.id });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const { id, action } = (await req.json().catch(() => ({}))) as { id?: number; action?: string };
  if (!id) return Response.json({ error: "شناسه لازم است" }, { status: 400 });
  const [s] = await db.select().from(signals).where(eq(signals.id, id));
  if (!s) return Response.json({ error: "سیگنال یافت نشد" }, { status: 404 });
  let price: number | null = null;
  try {
    price = (await getTickers([s.symbol])).tickers[s.symbol]?.price ?? null;
  } catch {
    /* price unavailable */
  }
  const cfg = await getConfig();

  if (action === "publish") {
    if (s.status !== "pending") return Response.json({ error: "فقط سیگنال‌های در انتظار قابل انتشارند" }, { status: 400 });
    const d = s.direction === "BUY" ? 1 : -1;
    if (price !== null && (d * (price - s.currentSl) <= 0 || d * (price - s.tp1) >= 0))
      return Response.json({ error: "قیمت فعلی از محدوده معتبر سیگنال (بین SL و TP1) خارج شده؛ انتشار ممکن نیست" }, { status: 400 });
    await db
      .update(signals)
      .set({ status: "active", createdAt: new Date(), lastCheckedAt: new Date(), expiresAt: new Date(Date.now() + cfg.engine.expiryCandles * TF_MS[s.timeframe as Timeframe]) })
      .where(eq(signals.id, id));
    await notify({
      type: "new",
      title: `🚦 سیگنال ${s.direction === "BUY" ? "خرید" : "فروش"} ${s.symbol}/USDT (${s.timeframe})`,
      body: `ورود: ${fmtPrice(s.entry)} | SL: ${fmtPrice(s.stopLoss)} | TP1: ${fmtPrice(s.tp1)} | قدرت: ${s.confidence}٪`,
      signalId: id,
    });
    return Response.json({ ok: true });
  }
  if (action === "stop") {
    if (s.status !== "active" && s.status !== "pending") return Response.json({ error: "این سیگنال قبلاً بسته شده است" }, { status: 400 });
    const wasActive = s.status === "active";
    const pnl = wasActive && price !== null ? blendedPnlPct(s, price) : null;
    await db
      .update(signals)
      .set({ status: "stopped", closePrice: wasActive ? price : null, pnlPct: pnl, closedAt: new Date() })
      .where(eq(signals.id, id));
    if (wasActive)
      await notify({
        type: "close",
        title: `⏹ معامله ${s.symbol}/USDT (${s.timeframe}) توسط مدیر متوقف شد`,
        body: pnl !== null ? `نتیجه نهایی: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}٪` : "قیمت لحظه‌ای در دسترس نبود",
        signalId: id,
      });
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    await db.delete(signals).where(eq(signals.id, id));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "عملیات نامعتبر" }, { status: 400 });
}
