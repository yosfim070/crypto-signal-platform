import { db } from "@/db";
import { coins, engineRuns, signals } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { isAdmin, isDefaultPassword, unauthorized } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { scanMarket, state, trackSignals } from "@/lib/engine/runner";
import { getCandles, health } from "@/lib/market/providers";
import { sendTelegram } from "@/lib/notify";
import { SOURCE_IDS, type SourceId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const t0 = Date.now();
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - t0;
  const [counts] = await db
    .select({
      coins: sql<number>`(select count(*)::int from ${coins} where enabled)`,
      active: sql<number>`count(*) filter (where status='active')::int`,
      pending: sql<number>`count(*) filter (where status='pending')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(signals);
  const runs = await db.select().from(engineRuns).orderBy(desc(engineRuns.id)).limit(10);
  const mem = process.memoryUsage();
  const cfg = await getConfig();
  return Response.json({
    db: { ok: dbOk, latencyMs: dbMs },
    uptimeSec: Math.floor(process.uptime()),
    memoryMb: Math.round(mem.rss / 1048576),
    node: process.version,
    engine: { ...state, enabled: cfg.engine.engineEnabled },
    sources: SOURCE_IDS.map((id) => ({ id, enabled: cfg.sources.enabled[id], primary: cfg.sources.primary === id, ...health[id] })),
    counts,
    runs: runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })),
    defaultPassword: isDefaultPassword(),
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { action?: string; source?: SourceId };
  if (b.action === "scan") {
    const r = await scanMarket();
    return Response.json({ ok: true, result: r, busy: r === null });
  }
  if (b.action === "track") {
    await trackSignals();
    return Response.json({ ok: true });
  }
  if (b.action === "telegram_test") {
    try {
      const { integrations } = await getConfig(true);
      await sendTelegram("✅ اتصال ربات تلگرام Meme Radar Pro برقرار است.", integrations);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (b.action === "source_test" && b.source && SOURCE_IDS.includes(b.source)) {
    const t0 = Date.now();
    try {
      const r = await getCandles("BTC", "1m", { limit: 5, source: b.source });
      return Response.json({ ok: true, used: r.source, latencyMs: Date.now() - t0, matched: r.source === b.source });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  return Response.json({ error: "عملیات نامعتبر" }, { status: 400 });
}
