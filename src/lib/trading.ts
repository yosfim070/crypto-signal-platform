import type { signals } from "@/db/schema";
import type { Direction, ModuleBreakdown, SignalDTO, SignalStatus, Timeframe } from "@/lib/types";

type Row = typeof signals.$inferSelect;

export const dirSign = (d: string) => (d === "BUY" ? 1 : -1);

export function pctMove(direction: string, entry: number, price: number) {
  return ((price - entry) / entry) * 100 * dirSign(direction);
}

/**
 * Blended PnL%: positions are scaled out in thirds at TP1/TP2/TP3.
 * Remaining portion is valued at `price` (current price or exit price).
 */
export function blendedPnlPct(
  s: { direction: string; entry: number; tp1: number; tp2: number; tp3: number; tpHit: number },
  price: number,
) {
  const tps = [s.tp1, s.tp2, s.tp3];
  let sum = 0;
  for (let i = 0; i < s.tpHit; i++) sum += pctMove(s.direction, s.entry, tps[i]) / 3;
  sum += ((3 - s.tpHit) / 3) * pctMove(s.direction, s.entry, price);
  return sum;
}

export function toDTO(r: Row): SignalDTO {
  return {
    id: r.id,
    symbol: r.symbol,
    direction: r.direction as Direction,
    timeframe: r.timeframe as Timeframe,
    entry: r.entry,
    stopLoss: r.stopLoss,
    currentSl: r.currentSl,
    tp1: r.tp1,
    tp2: r.tp2,
    tp3: r.tp3,
    support: r.support,
    resistance: r.resistance,
    confidence: r.confidence,
    riskReward: r.riskReward,
    reason: r.reason,
    breakdown: (r.breakdown as ModuleBreakdown[] | null) ?? null,
    status: r.status as SignalStatus,
    source: r.source as "engine" | "manual",
    dataSource: r.dataSource,
    tpHit: r.tpHit,
    closePrice: r.closePrice,
    pnlPct: r.pnlPct,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    expiresAt: r.expiresAt.toISOString(),
  };
}
