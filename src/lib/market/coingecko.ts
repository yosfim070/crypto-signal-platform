export type MarketInfo = { image: string | null; marketCap: number | null; rank: number | null; sparkline: number[] };

const g = globalThis as typeof globalThis & { __mrCg?: { at: number; key: string; data: Record<string, MarketInfo> } };

/** Market cap / logo / 7d sparkline from CoinGecko. Cached; serves stale data on failure. */
export async function getMarketInfo(
  coins: { symbol: string; coingeckoId: string | null }[],
): Promise<{ info: Record<string, MarketInfo>; stale: boolean; error: string | null }> {
  const withId = coins.filter((c) => c.coingeckoId);
  const key = withId.map((c) => c.coingeckoId).sort().join(",");
  const hit = g.__mrCg;
  if (hit && hit.key === key && Date.now() - hit.at < 120_000) return { info: hit.data, stale: false, error: null };
  if (!withId.length) return { info: {}, stale: false, error: null };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${key}&sparkline=true&per_page=250&price_change_percentage=24h`,
      { signal: ctl.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const rows = (await r.json()) as {
      id: string;
      image: string;
      market_cap: number;
      market_cap_rank: number;
      sparkline_in_7d?: { price: number[] };
    }[];
    const byId = new Map(rows.map((x) => [x.id, x]));
    const data: Record<string, MarketInfo> = {};
    for (const c of withId) {
      const row = byId.get(c.coingeckoId!);
      if (row)
        data[c.symbol] = {
          image: row.image ?? null,
          marketCap: row.market_cap ?? null,
          rank: row.market_cap_rank ?? null,
          sparkline: row.sparkline_in_7d?.price?.filter((_, i, a) => i % Math.ceil(a.length / 56) === 0) ?? [],
        };
    }
    g.__mrCg = { at: Date.now(), key, data };
    return { info: data, stale: false, error: null };
  } catch (e) {
    if (hit && hit.key === key) return { info: hit.data, stale: true, error: (e as Error).message };
    return { info: {}, stale: true, error: (e as Error).message };
  }
}
