import type { Candle, Direction, EngineConfig, ModuleBreakdown, ModulesConfig, Timeframe } from "@/lib/types";
import { TF_MS } from "@/lib/types";
import { atr, ema, macd, rsi } from "./indicators";
import { MODULES } from "./modules";

export type TradePlan = {
  entry: number;
  stopLoss: number;
  tp: [number, number, number];
  riskReward: number;
};

export type AnalysisResult = {
  symbol: string;
  timeframe: Timeframe;
  price: number;
  atr: number;
  direction: Direction | "NEUTRAL";
  confidence: number;
  net: number;
  modules: ModuleBreakdown[];
  support: number | null;
  resistance: number | null;
  supports: number[];
  resistances: number[];
  indicators: { rsi: number; macdHist: number; ema9: number; ema21: number; ema50: number; atrPct: number };
  plan: TradePlan | null;
  rejected: string | null;
  reason: string;
  candleTime: number;
};

const MIN_CANDLES = 120;

export function analyze(
  symbol: string,
  timeframe: Timeframe,
  all: Candle[],
  cfg: { engine: EngineConfig; modules: ModulesConfig },
): AnalysisResult {
  const live = all[all.length - 1];
  const closed = live && live.t + TF_MS[timeframe] > Date.now() ? all.slice(0, -1) : all;
  const price = live?.c ?? 0;
  const base: AnalysisResult = {
    symbol,
    timeframe,
    price,
    atr: 0,
    direction: "NEUTRAL",
    confidence: 0,
    net: 0,
    modules: [],
    support: null,
    resistance: null,
    supports: [],
    resistances: [],
    indicators: { rsi: NaN, macdHist: NaN, ema9: NaN, ema21: NaN, ema50: NaN, atrPct: NaN },
    plan: null,
    rejected: null,
    reason: "",
    candleTime: closed[closed.length - 1]?.t ?? 0,
  };
  if (closed.length < MIN_CANDLES) return { ...base, rejected: "داده تاریخی کافی نیست", reason: "داده تاریخی کافی نیست" };

  const a = atr(closed, 14);
  const curAtr = a[a.length - 1];
  if (!Number.isFinite(curAtr) || curAtr <= 0) return { ...base, rejected: "ATR نامعتبر", reason: "نوسان قابل محاسبه نیست" };
  const ctx = { candles: closed, price, atr: curAtr };

  const breakdown: ModuleBreakdown[] = [];
  const supports: number[] = [];
  const resistances: number[] = [];
  let wSum = 0;
  let sSum = 0;
  for (const def of MODULES) {
    const mc = cfg.modules[def.id];
    if (!mc?.enabled || mc.weight <= 0) continue;
    try {
      const out = def.run(ctx, mc.params);
      breakdown.push({ id: def.id, name: def.name, score: Number(out.score.toFixed(3)), weight: mc.weight, reason: out.reason });
      wSum += mc.weight;
      sSum += mc.weight * out.score;
      supports.push(...(out.levels?.support ?? []));
      resistances.push(...(out.levels?.resistance ?? []));
    } catch (e) {
      breakdown.push({ id: def.id, name: def.name, score: 0, weight: mc.weight, reason: `خطا در ماژول: ${(e as Error).message}` });
    }
  }
  if (wSum === 0) return { ...base, atr: curAtr, rejected: "هیچ ماژول فعالی وجود ندارد", reason: "ماژول فعالی نیست" };

  const net = sSum / wSum;
  const direction: Direction | "NEUTRAL" = net > 0.1 ? "BUY" : net < -0.1 ? "SELL" : "NEUTRAL";
  let agree = 0;
  let active = 0;
  for (const m of breakdown) {
    if (Math.abs(m.score) < 0.1) continue;
    active += m.weight;
    if (direction !== "NEUTRAL" && Math.sign(m.score) === Math.sign(net)) agree += m.weight;
  }
  const agreement = active > 0 ? agree / active : 0;
  const confidence = direction === "NEUTRAL" ? Math.round(Math.min(40, Math.abs(net) * 300)) : Math.round(100 * (0.65 * Math.min(1, Math.abs(net) / 0.4) + 0.35 * agreement));

  const sup = supports.filter((x) => x < price).sort((x, y) => y - x);
  const res = resistances.filter((x) => x > price).sort((x, y) => x - y);
  const closes = closed.map((c) => c.c);
  const m = macd(closes);
  const indicators = {
    rsi: rsi(closes, 14).at(-1) ?? NaN,
    macdHist: m.hist.at(-1) ?? NaN,
    ema9: ema(closes, 9).at(-1) ?? NaN,
    ema21: ema(closes, 21).at(-1) ?? NaN,
    ema50: ema(closes, 50).at(-1) ?? NaN,
    atrPct: (curAtr / price) * 100,
  };

  const result: AnalysisResult = {
    ...base,
    atr: curAtr,
    direction,
    confidence,
    net,
    modules: breakdown,
    support: sup[0] ?? null,
    resistance: res[0] ?? null,
    supports: sup.slice(0, 3),
    resistances: res.slice(0, 3),
    indicators,
  };

  if (direction === "NEUTRAL") return { ...result, reason: "تعادل نیروهای خرید و فروش؛ سیگنالی صادر نمی‌شود", rejected: "خنثی" };

  // ---- Trade plan (structure + ATR based) ----
  const dir = direction === "BUY" ? 1 : -1;
  const entry = price;
  const structural = dir === 1 ? (sup[0] !== undefined ? sup[0] - 0.2 * curAtr : NaN) : res[0] !== undefined ? res[0] + 0.2 * curAtr : NaN;
  let risk = cfg.engine.atrMultiplier * curAtr;
  if (Number.isFinite(structural)) {
    const d = Math.abs(entry - structural);
    if (d >= curAtr && d <= 3 * curAtr) risk = d;
  }
  const stopLoss = entry - dir * risk;
  const oppo = dir === 1 ? res[0] : sup[0];
  let d1 = 1.5 * risk;
  const oppoDist = oppo !== undefined ? Math.abs(oppo - entry) : Infinity;
  if (oppo !== undefined) d1 = Math.min(2 * risk, Math.max(risk, oppoDist));
  const tp: [number, number, number] = [entry + dir * d1, entry + dir * d1 * 1.8, entry + dir * d1 * 3];
  const riskReward = (d1 * 1.8) / risk;
  const plan: TradePlan = { entry, stopLoss, tp, riskReward };

  const top = breakdown
    .filter((x) => Math.sign(x.score) === Math.sign(net) && Math.abs(x.score) >= 0.3)
    .sort((x, y) => Math.abs(y.score * y.weight) - Math.abs(x.score * x.weight))
    .slice(0, 4)
    .map((x) => x.reason);
  const reason = `${direction === "BUY" ? "خرید" : "فروش"} با اطمینان ${confidence}٪ — ${top.join("؛ ") || "هم‌سویی ضعیف ماژول‌ها"}`;
  const slPct = (risk / entry) * 100;
  let rejected: string | null = null;
  if (slPct > cfg.engine.maxSlPct) rejected = `حد ضرر ${slPct.toFixed(1)}٪ بیشتر از سقف مجاز`;
  else if (slPct < 0.1) rejected = "حد ضرر بسیار نزدیک است";
  else if (oppoDist < 0.6 * risk) rejected = "سطح مقابل بسیار نزدیک است و ریوارد کافی وجود ندارد";
  else if (riskReward < cfg.engine.minRR) rejected = "ریسک به ریوارد کمتر از حداقل";
  else if (stopLoss <= 0) rejected = "حد ضرر نامعتبر";

  return { ...result, plan, reason, rejected };
}
