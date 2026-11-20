import { parseFilters, querySignals, signalStats } from "@/lib/signalQuery";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const f = parseFilters(new URL(req.url).searchParams);
    const [list, stats] = await Promise.all([querySignals(f), signalStats(f)]);
    return Response.json({ ...list, stats });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
