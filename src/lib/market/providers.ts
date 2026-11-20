import { getConfig } from "@/lib/config";
import type { Candle, SourceId, Ticker, Timeframe } from "@/lib/types";
import { SOURCE_IDS, TF_MS } from "@/lib/types";

type Adapter = {
  candles: (symbol: string, tf: Timeframe, limit: number) => Promise<Candle[]>;
  tickers: (symbols: string[]) => Promise<Record<string, Ticker>>;
};

export type SourceHealth = {
  ok: number;
  fail: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastSuccessAt: number | null;
};

const g = globalThis as typeof globalThis & {
  __mrCache?: Map<string, { exp: number; val: unknown }>;
  __mrHealth?: Record<SourceId, SourceHealth>;
};
const cache = (g.__mrCache ??= new Map());
export const health: Record<SourceId, SourceHealth> = (g.__mrHealth ??= {
  binance: { ok: 0, fail: 0, lastLatencyMs: null, lastError: null, lastSuccessAt: null },
  okx: { ok: 0, fail: 0, lastLatencyMs: null, lastError: null, lastSuccessAt: null },
  kucoin: { ok: 0, fail: 0, lastLatencyMs: null, lastError: null, lastSuccessAt: null },
});

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const num = (x: unknown) => Number(x);

/* ---------------- Binance (public market-data hosts) ---------------- */
const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
async function binanceGet<T>(path: string): Promise<T> {
  let err: unknown;
  for (const h of BINANCE_HOSTS) {
    try {
      return await getJson<T>(h + path);
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

const binance: Adapter = {
  async candles(symbol, tf, limit) {
    const rows = await binanceGet<unknown[][]>(`/api/v3/klines?symbol=${symbol}USDT&interval=${tf}&limit=${Math.min(limit, 1000)}`);
    return rows.map((r) => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) }));
  },
  async tickers(symbols) {
    const list = encodeURIComponent(JSON.stringify(symbols.map((s) => `${s}USDT`)));
    type T = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; highPrice: string; lowPrice: string };
    const rows = await binanceGet<T[]>(`/api/v3/ticker/24hr?symbols=${list}`);
    const out: Record<string, Ticker> = {};
    for (const r of rows)
      out[r.symbol.replace(/USDT$/, "")] = {
        price: num(r.lastPrice),
        change24h: num(r.priceChangePercent),
        volume24h: num(r.quoteVolume),
        high24h: num(r.highPrice),
        low24h: num(r.lowPrice),
      };
    return out;
  },
};

/* ---------------- OKX ---------------- */
const OKX_BAR: Record<Timeframe, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
const okx: Adapter = {
  async candles(symbol, tf, limit) {
    const j = await getJson<{ code: string; msg: string; data: string[][] }>(
      `https://www.okx.com/api/v5/market/candles?instId=${symbol}-USDT&bar=${OKX_BAR[tf]}&limit=${Math.min(limit, 300)}`,
    );
    if (j.code !== "0") throw new Error(j.msg || "OKX error");
    return j.data.map((r) => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) })).reverse();
  },
  async tickers(symbols) {
    const j = await getJson<{ code: string; data: { instId: string; last: string; open24h: string; high24h: string; low24h: string; volCcy24h: string }[] }>(
      "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
    );
    const want = new Set(symbols.map((s) => `${s}-USDT`));
    const out: Record<string, Ticker> = {};
    for (const r of j.data) {
      if (!want.has(r.instId)) continue;
      const last = num(r.last);
      const open = num(r.open24h);
      out[r.instId.replace("-USDT", "")] = {
        price: last,
        change24h: open ? ((last - open) / open) * 100 : 0,
        volume24h: num(r.volCcy24h),
        high24h: num(r.high24h),
        low24h: num(r.low24h),
      };
    }
    return out;
  },
};

/* ---------------- KuCoin ---------------- */
const KC_TYPE: Record<Timeframe, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1hour", "4h": "4hour", "1d": "1day" };
const kucoin: Adapter = {
  async candles(symbol, tf, limit) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - Math.ceil((limit * TF_MS[tf]) / 1000) - 60;
    const j = await getJson<{ code: string; data: string[][] }>(
      `https://api.kucoin.com/api/v1/market/candles?symbol=${symbol}-USDT&type=${KC_TYPE[tf]}&startAt=${start}&endAt=${end}`,
    );
    if (j.code !== "200000") throw new Error("KuCoin error");
    return j.data
      .map((r) => ({ t: num(r[0]) * 1000, o: num(r[1]), c: num(r[2]), h: num(r[3]), l: num(r[4]), v: num(r[5]) }))
      .reverse()
      .slice(-limit);
  },
  async tickers(symbols) {
    const j = await getJson<{ data: { ticker: { symbol: string; last: string; changeRate: string; volValue: string; high: string; low: string }[] } }>(
      "https://api.kucoin.com/api/v1/market/allTickers",
    );
    const want = new Set(symbols.map((s) => `${s}-USDT`));
    const out: Record<string, Ticker> = {};
    for (const r of j.data.ticker) {
      if (!want.has(r.symbol)) continue;
      out[r.symbol.replace("-USDT", "")] = {
        price: num(r.last),
        change24h: num(r.changeRate) * 100,
        volume24h: num(r.volValue),
        high24h: num(r.high),
        low24h: num(r.low),
      };
    }
    return out;
  },
};

const ADAPTERS: Record<SourceId, Adapter> = { binance, okx, kucoin };

async function order(preferred?: SourceId): Promise<SourceId[]> {
  const cfg = await getConfig();
  const enabled = SOURCE_IDS.filter((s) => cfg.sources.enabled[s]);
  const first = preferred && cfg.sources.enabled[preferred] ? preferred : cfg.sources.primary;
  return [first, ...enabled.filter((s) => s !== first)].filter((s) => cfg.sources.enabled[s]);
}

async function withFallback<T>(preferred: SourceId | undefined, fn: (a: Adapter) => Promise<T>): Promise<{ data: T; source: SourceId }> {
  const errors: string[] = [];
  for (const id of await order(preferred)) {
    const t0 = Date.now();
    try {
      const data = await fn(ADAPTERS[id]);
      health[id].ok++;
      health[id].lastLatencyMs = Date.now() - t0;
      health[id].lastSuccessAt = Date.now();
      return { data, source: id };
    } catch (e) {
      health[id].fail++;
      health[id].lastError = (e as Error).message;
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.length ? `همه منابع داده ناموفق بودند (${errors.join(" | ")})` : "هیچ منبع داده‌ای فعال نیست");
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val as T;
  const val = await load();
  cache.set(key, { exp: Date.now() + ttlMs, val });
  if (cache.size > 400) for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  return val;
}

export async function getCandles(symbol: string, tf: Timeframe, opts: { limit?: number; source?: SourceId } = {}) {
  const limit = opts.limit ?? 300;
  const ttl = Math.min(15_000, TF_MS[tf] / 4);
  return cached(`c:${symbol}:${tf}:${limit}:${opts.source ?? ""}`, ttl, async () => {
    const r = await withFallback(opts.source, (a) => a.candles(symbol, tf, limit));
    if (r.data.length < 2) throw new Error(`کندلی برای ${symbol} دریافت نشد`);
    return { candles: r.data, source: r.source };
  });
}

export async function getTickers(symbols: string[], source?: SourceId) {
  if (!symbols.length) return { tickers: {} as Record<string, Ticker>, source: null as SourceId | null };
  const key = `t:${[...symbols].sort().join(",")}:${source ?? ""}`;
  return cached(key, 4000, async () => {
    const r = await withFallback(source, (a) => a.tickers(symbols));
    return { tickers: r.data, source: r.source as SourceId | null };
  });
}
