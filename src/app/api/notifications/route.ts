import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(notifications).orderBy(desc(notifications.id)).limit(40);
    return Response.json({ items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, items: [] }, { status: 500 });
  }
}
