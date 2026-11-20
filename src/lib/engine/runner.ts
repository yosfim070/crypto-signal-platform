import { db } from "@/db";
import { coins, engineRuns, signals } from "@/db/schema";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { analyze } from "@/lib/analysis/engine";
import { ensureSeed, getConfig } from "@/lib/config";
import { getCandles } from "@/lib/market/providers";
import { notify } from "@/lib/notify";
import { blendedPnlPct } from "@/lib/trading";
import { TF_MS, type Timeframe } from "@/lib/types";
import { fmtPrice } from "@/lib/format";

type State = {
  started: boolean;
  startedAt: number;
  lastScanAt: number;
  lastTrackAt: number;
  lastScanError: string | null;
  scanning: boolean;
  tracking: boolean;
  lastScan: { scanned: number; generated: number; errors: string[]; durationMs: number } | null;
};
const g = globalThis as typeof globalThis & { __mrState?: State };
export type Snapshot = {
  tf: Timeframe;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  support: number | null;
  resistance: number | null;
  at: number;
};
export const snapshots: Map<string, Partial<Record<Timeframe, Snapshot>>> = ((globalThis as typeof globalThis & {
  __mrSnaps?: Map<string, Partial<Record<Timeframe, Snapshot>>>;
}).__mrSnaps ??= new Map());

export const state: State = (g.__mrState ??= {
  started: false,
  startedAt: Date.now(),
  lastScanAt: 0,
  lastTrackAt: 0,
  lastScanError: null,
  scanning: false,
  tracking: false,
  lastScan: null,
});

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export async function scanMarket() {
  if (state.scanning) return null;
  state.scanning = true;
  const t0 = Date.now();
  const errors: string[] = [];
  let scanned = 0;
  let generated = 0;
  try {
    await ensureSeed();
    const cfg = await getConfig(true);
    const list = await db.select().from(coins).where(eq(coins.enabled, true));
    const tasks = list.flatMap((c) => cfg.engine.timeframes.map((tf) => ({ symbol: c.symbol, tf })));
    await pool(tasks, 4, async ({ symbol, tf }) => {
      try {
        const { candles, source } = await getCandles(symbol, tf, { limit: 300 });
        scanned++;
        const res = analyze(symbol, tf, candles, cfg);
        const snap = snapshots.get(symbol) ?? {};
        snap[tf] = { tf, direction: res.direction, confidence: res.confidence, support: res.support, resistance: res.resistance, at: Date.now() };
        snapshots.set(symbol, snap);
        if (res.direction === "NEUTRAL" || !res.plan || res.rejected || res.confidence < cfg.engine.minConfidence) return;
        const open = await db
          .select({ id: signals.id })
          .from(signals)
          .where(and(eq(signals.symbol, symbol), eq(signals.timeframe, tf), inArray(signals.status, ["active", "pending"])))
          .limit(1);
        if (open.length) return;
        const since = new Date(Date.now() - cfg.engine.cooldownCandles * TF_MS[tf]);
        const recent = await db
          .select({ id: signals.id })
          .from(signals)
          .where(and(eq(signals.symbol, symbol), eq(signals.timeframe, tf), gte(signals.createdAt, since)))
          .limit(1);
        if (recent.length) return;
        const p = res.plan;
        const publish = cfg.engine.autoPublish;
        const [row] = await db
          .insert(signals)
          .values({
            symbol,
            direction: res.direction,
            timeframe: tf,
            entry: p.entry,
            stopLoss: p.stopLoss,
            currentSl: p.stopLoss,
            tp1: p.tp[0],
            tp2: p.tp[1],
            tp3: p.tp[2],
            support: res.support,
            resistance: res.resistance,
            confidence: res.confidence,
            riskReward: Number(p.riskReward.toFixed(2)),
            reason: res.reason,
            breakdown: res.modules,
            status: publish ? "active" : "pending",
            source: "engine",
            dataSource: source,
            expiresAt: new Date(Date.now() + cfg.engine.expiryCandles * TF_MS[tf]),
          })
          .returning();
        generated++;
        if (publish)
          await notify({
            type: "new",
            title: `🚦 سیگنال جدید ${res.direction === "BUY" ? "خرید" : "فروش"} ${symbol}/USDT (${tf})`,
            body: `ورود: ${fmtPrice(p.entry)} | SL: ${fmtPrice(p.stopLoss)} | TP1: ${fmtPrice(p.tp[0])} | قدرت: ${res.confidence}٪`,
            signalId: row.id,
          });
      } catch (e) {
        if (errors.length < 8) errors.push(`${symbol}/${tf}: ${(e as Error).message}`);
      }
    });
    state.lastScanError = errors.length && scanned === 0 ? errors[0] : null;
  } catch (e) {
    state.lastScanError = (e as Error).message;
    errors.push((e as Error).message);
  } finally {
    state.scanning = false;
    state.lastScanAt = Date.now();
    const durationMs = Date.now() - t0;
    state.lastScan = { scanned, generated, errors, durationMs };
    try {
      await db.insert(engineRuns).values({ durationMs, scanned, generated, errors });
      const [old] = await db.select({ id: engineRuns.id }).from(engineRuns).orderBy(desc(engineRuns.id)).offset(200).limit(1);
      if (old) await db.delete(engineRuns).where(lt(engineRuns.id, old.id));
    } catch {
      /* ignore logging failure */
    }
  }
  return state.lastScan;
}

export async function trackSignals() {
  if (state.tracking) return;
  state.tracking = true;
  try {
    const active = await db.select().from(signals).where(eq(signals.status, "active"));
    await pool(active, 4, async (s) => {
      try {
        const now = Date.now();
        const lastMs = s.lastCheckedAt.getTime();
        const spanMin = (now - lastMs) / 60000;
        const tf: Timeframe = spanMin <= 280 ? "1m" : spanMin <= 1400 ? "5m" : "1h";
        const interval = TF_MS[tf];
        const limit = Math.min(300, Math.ceil((now - lastMs) / interval) + 3);
        const { candles } = await getCandles(s.symbol, tf, { limit });
        const createdMs = s.createdAt.getTime();
        const dir = s.direction === "BUY" ? 1 : -1;
        const tps = [s.tp1, s.tp2, s.tp3];
        let tpHit = s.tpHit;
        let sl = s.currentSl;
        let skipUntil = 0;
        let closed: { status: "success" | "failed" | "expired"; price: number } | null = null;
        const events: { type: "tp" | "sl" | "close"; title: string; body: string }[] = [];
        const label = `${s.symbol}/USDT (${s.timeframe})`;

        for (const c of candles) {
          if (c.t < createdMs || c.t + interval <= lastMs || c.t < skipUntil) continue;
          const slHit = dir === 1 ? c.l <= sl : c.h >= sl;
          if (slHit) {
            closed = { status: tpHit >= 1 ? "success" : "failed", price: sl };
            break;
          }
          let moved = false;
          while (tpHit < 3 && (dir === 1 ? c.h >= tps[tpHit] : c.l <= tps[tpHit])) {
            tpHit++;
            moved = true;
            events.push({ type: "tp", title: `🎯 ${label} به TP${tpHit} رسید`, body: `قیمت هدف ${fmtPrice(tps[tpHit - 1])} لمس شد.` });
            if (tpHit === 1) sl = s.entry;
            if (tpHit === 2) sl = s.tp1;
          }
          if (tpHit >= 3) {
            closed = { status: "success", price: tps[2] };
            break;
          }
          if (moved) skipUntil = c.t + interval;
        }

        const lastCandle = candles[candles.length - 1];
        if (!closed && now >= s.expiresAt.getTime()) closed = { status: "expired", price: lastCandle.c };

        const base = { tpHit, currentSl: sl, lastCheckedAt: new Date(Math.max(skipUntil, lastCandle.t)) };
        if (closed) {
          const pnl = blendedPnlPct({ ...s, tpHit }, closed.price);
          await db
            .update(signals)
            .set({ ...base, status: closed.status, closePrice: closed.price, pnlPct: pnl, closedAt: new Date() })
            .where(and(eq(signals.id, s.id), eq(signals.status, "active")));
          const p = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}٪`;
          if (closed.status === "failed")
            events.push({ type: "sl", title: `🛑 ${label} به حد ضرر خورد`, body: `خروج در ${fmtPrice(closed.price)} | نتیجه نهایی: ${p}` });
          else if (events.length === 0 || closed.status === "expired" || closed.price === sl)
            events.push({
              type: closed.price === sl && closed.status === "success" ? "sl" : "close",
              title: `${closed.status === "expired" ? "⏳" : "✅"} معامله ${label} بسته شد`,
              body: `${closed.status === "expired" ? "منقضی شد" : "با سود بسته شد"} | نتیجه نهایی: ${p}`,
            });
          else events.push({ type: "close", title: `✅ معامله ${label} بسته شد`, body: `همه اهداف لمس شد | نتیجه نهایی: ${p}` });
        } else {
          await db.update(signals).set(base).where(and(eq(signals.id, s.id), eq(signals.status, "active")));
        }
        for (const e of events) await notify({ ...e, signalId: s.id });
      } catch (e) {
        console.error(`[tracker] ${s.symbol}:`, (e as Error).message);
      }
    });
  } finally {
    state.tracking = false;
    state.lastTrackAt = Date.now();
  }
}

export function startScheduler() {
  if (state.started) return;
  state.started = true;
  state.startedAt = Date.now();
  const safe = (fn: () => Promise<unknown>) => () => {
    fn().catch((e) => console.error("[scheduler]", (e as Error).message));
  };
  setTimeout(
    safe(async () => {
      await ensureSeed();
      await scanMarket();
    }),
    6000,
  );
  setInterval(safe(trackSignals), 15_000);
  setInterval(
    safe(async () => {
      const cfg = await getConfig();
      if (!cfg.engine.engineEnabled) return;
      if (Date.now() - state.lastScanAt >= cfg.engine.scanIntervalSec * 1000) await scanMarket();
    }),
    10_000,
  );
}
