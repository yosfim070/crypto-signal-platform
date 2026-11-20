import { db } from "@/db";
import { signals } from "@/db/schema";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { toDTO } from "@/lib/trading";
import type { SignalDTO } from "@/lib/types";

export type SignalFilters = {
  from?: string | null;
  to?: string | null;
  symbol?: string | null;
  tf?: string | null;
  dir?: string | null;
  status?: string | null;
  includePending?: boolean;
  limit?: number;
  offset?: number;
};

export function parseFilters(sp: URLSearchParams): SignalFilters {
  return {
    from: sp.get("from"),
    to: sp.get("to"),
    symbol: sp.get("symbol"),
    tf: sp.get("tf"),
    dir: sp.get("dir"),
    status: sp.get("status"),
    limit: Math.min(Number(sp.get("limit") ?? 50) || 50, 5000),
    offset: Number(sp.get("offset") ?? 0) || 0,
  };
}

function where(f: SignalFilters) {
  const c: SQL[] = [];
  if (f.from) c.push(gte(signals.createdAt, new Date(f.from)));
  if (f.to) c.push(lte(signals.createdAt, new Date(new Date(f.to).getTime() + 86_400_000 - 1)));
  if (f.symbol) c.push(eq(signals.symbol, f.symbol.toUpperCase()));
  if (f.tf) c.push(eq(signals.timeframe, f.tf));
  if (f.dir === "BUY" || f.dir === "SELL") c.push(eq(signals.direction, f.dir));
  if (f.status) c.push(eq(signals.status, f.status));
  else if (!f.includePending) c.push(inArray(signals.status, ["active", "success", "failed", "expired", "stopped"]));
  return c.length ? and(...c) : undefined;
}

export async function querySignals(f: SignalFilters): Promise<{ items: SignalDTO[]; total: number }> {
  const w = where(f);
  const rows = await db.select().from(signals).where(w).orderBy(desc(signals.createdAt)).limit(f.limit ?? 50).offset(f.offset ?? 0);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(signals).where(w);
  return { items: rows.map(toDTO), total: n };
}

export async function signalStats(f: SignalFilters) {
  const w = where(f);
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where status = 'success')::int`,
      losses: sql<number>`count(*) filter (where status = 'failed')::int`,
      expired: sql<number>`count(*) filter (where status = 'expired')::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      sumPnl: sql<number>`coalesce(sum(pnl_pct) filter (where status in ('success','failed','expired')),0)::float`,
      avgPnl: sql<number>`coalesce(avg(pnl_pct) filter (where status in ('success','failed','expired')),0)::float`,
    })
    .from(signals)
    .where(w);
  const decided = r.wins + r.losses;
  return { ...r, winRate: decided > 0 ? (r.wins / decided) * 100 : null };
}
