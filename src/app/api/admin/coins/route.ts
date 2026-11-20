import { db } from "@/db";
import { coins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin, unauthorized } from "@/lib/auth";
import { getTickers } from "@/lib/market/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const rows = await db.select().from(coins).orderBy(coins.id);
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { symbol?: string; name?: string; coingeckoId?: string };
  const symbol = (b.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(symbol)) return Response.json({ error: "نماد نامعتبر است (مثال: DOGE)" }, { status: 400 });
  try {
    const t = await getTickers([symbol]);
    if (!t.tickers[symbol]) return Response.json({ error: `جفت‌ارز ${symbol}/USDT در منبع داده یافت نشد` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: `اعتبارسنجی نماد ناموفق بود: ${(e as Error).message}` }, { status: 502 });
  }
  const [row] = await db
    .insert(coins)
    .values({ symbol, name: (b.name ?? "").trim() || symbol, coingeckoId: (b.coingeckoId ?? "").trim() || null })
    .onConflictDoNothing()
    .returning();
  if (!row) return Response.json({ error: "این ارز قبلاً اضافه شده است" }, { status: 409 });
  return Response.json({ item: row });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { id?: number; enabled?: boolean; name?: string; coingeckoId?: string };
  if (!b.id) return Response.json({ error: "شناسه لازم است" }, { status: 400 });
  const set: Partial<typeof coins.$inferInsert> = {};
  if (typeof b.enabled === "boolean") set.enabled = b.enabled;
  if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim();
  if (typeof b.coingeckoId === "string") set.coingeckoId = b.coingeckoId.trim() || null;
  await db.update(coins).set(set).where(eq(coins.id, b.id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "شناسه لازم است" }, { status: 400 });
  await db.delete(coins).where(eq(coins.id, id));
  return Response.json({ ok: true });
}
