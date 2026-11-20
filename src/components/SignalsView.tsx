"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePoll, useNow } from "@/lib/hooks";
import { fa, fmtCompact, fmtDate, fmtPct, fmtPrice, timeAgo } from "@/lib/format";
import type { SignalDTO, Ticker } from "@/lib/types";
import AiModal from "./AiModal";
import SignalCard, { LivePrice } from "./SignalCard";
import { CoinLogo, DirBadge, Empty, ErrorBox, PageTitle, Spark, Spinner, Stat, Strength } from "./ui";

type Snap = { tf: string; direction: "BUY" | "SELL" | "NEUTRAL"; confidence: number; support: number | null; resistance: number | null; at: number };
type Dash = {
  coins: { symbol: string; name: string }[];
  tickers: Record<string, Ticker>;
  info: Record<string, { image: string | null; marketCap: number | null; rank: number | null; sparkline: number[] }>;
  infoError: string | null;
  signals: SignalDTO[];
  snapshots: Record<string, Record<string, Snap>>;
  system: {
    online: boolean;
    source: string | null;
    marketError: string | null;
    engineEnabled: boolean;
    minConfidence: number;
    timeframes: string[];
    scanIntervalSec: number;
    lastScanAt: number | null;
    scanning: boolean;
    lastScan: { scanned: number; generated: number; errors: string[] } | null;
  };
};

type SortKey = "strength" | "change" | "volume" | "cap" | "recent";

export default function SignalsView() {
  const { data, error, loading, refresh, updatedAt } = usePoll<Dash>("/api/dashboard", 5000);
  const now = useNow(1000);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"ALL" | "BUY" | "SELL" | "NEUTRAL">("ALL");
  const [tf, setTf] = useState("all");
  const [minStr, setMinStr] = useState(0);
  const [sort, setSort] = useState<SortKey>("strength");
  const [view, setView] = useState<"table" | "cards">("table");
  const [statusF, setStatusF] = useState<"active" | "all">("active");
  const [ai, setAi] = useState<{ symbol: string; tf: string } | null>(null);

  useEffect(() => {
    if (window.innerWidth < 768) setView("cards");
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.coins.map((c) => {
      const sigs = data.signals.filter((s) => s.symbol === c.symbol && s.status === "active" && (tf === "all" || s.timeframe === tf)).sort((a, b) => b.confidence - a.confidence);
      const sig = sigs[0] ?? null;
      const snaps = Object.values(data.snapshots[c.symbol] ?? {}).filter((x) => tf === "all" || x.tf === tf).sort((a, b) => b.confidence - a.confidence);
      const snap = snaps[0] ?? null;
      return {
        ...c,
        t: data.tickers[c.symbol] as Ticker | undefined,
        info: data.info[c.symbol],
        sig,
        extra: sigs.length - 1,
        direction: (sig ? sig.direction : "NEUTRAL") as "BUY" | "SELL" | "NEUTRAL",
        strength: sig ? sig.confidence : (snap?.confidence ?? 0),
        support: sig?.support ?? snap?.support ?? null,
        resistance: sig?.resistance ?? snap?.resistance ?? null,
        snapTf: snap?.tf ?? null,
      };
    });
    const ql = q.trim().toLowerCase();
    return list
      .filter((r) => (!ql || r.symbol.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql)) && (dir === "ALL" || r.direction === dir) && r.strength >= minStr)
      .sort((a, b) => {
        switch (sort) {
          case "change": return (b.t?.change24h ?? -999) - (a.t?.change24h ?? -999);
          case "volume": return (b.t?.volume24h ?? 0) - (a.t?.volume24h ?? 0);
          case "cap": return (b.info?.marketCap ?? 0) - (a.info?.marketCap ?? 0);
          case "recent": return new Date(b.sig?.createdAt ?? 0).getTime() - new Date(a.sig?.createdAt ?? 0).getTime();
          default: return Number(!!b.sig) - Number(!!a.sig) || b.strength - a.strength;
        }
      });
  }, [data, q, dir, tf, minStr, sort]);

  const cards = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    return data.signals
      .filter((s) => (statusF === "all" || s.status === "active") && (!ql || s.symbol.toLowerCase().includes(ql)) && (dir === "ALL" || dir === "NEUTRAL" ? dir === "ALL" : s.direction === dir) && (tf === "all" || s.timeframe === tf) && s.confidence >= minStr)
      .sort((a, b) => (sort === "recent" ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : b.confidence - a.confidence));
  }, [data, q, dir, tf, minStr, sort, statusF]);

  if (loading && !data) return <Spinner label="در حال دریافت داده‌های زنده بازار…" />;
  if (!data) return <ErrorBox message={error ?? "خطا در دریافت اطلاعات"} onRetry={refresh} />;

  const sys = data.system;
  const active = data.signals.filter((s) => s.status === "active");
  const buy = active.filter((s) => s.direction === "BUY").length;
  const sell = active.length - buy;
  const lagSec = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;

  return (
    <div>
      <PageTitle
        title="داشبورد سیگنال‌ها"
        sub="سیگنال‌های تولیدشده توسط موتور تحلیل تکنیکال روی داده‌های زنده صرافی‌ها"
        right={
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold ${sys.online ? "border-up/40 text-up" : "border-down/40 text-down"}`}>
              <span className="inline-block size-2 animate-pulse-dot rounded-full bg-current" />
              {sys.online ? `داده زنده • ${sys.source?.toUpperCase()}` : "منبع داده قطع است"}
            </span>
            <button className="btn !py-1.5" onClick={refresh}>⟳ <span className="text-muted">{fa(lagSec)} ثانیه پیش</span></button>
          </div>
        }
      />

      {sys.marketError && <div className="mb-4"><ErrorBox message={`اتصال به منابع بازار برقرار نیست: ${sys.marketError}`} onRetry={refresh} /></div>}
      {!sys.engineEnabled && <div className="card mb-4 border-warn/40 p-3 text-sm text-warn">⏸ موتور تحلیل توسط مدیر غیرفعال شده است؛ سیگنال جدیدی صادر نمی‌شود.</div>}
      {sys.engineEnabled && !sys.lastScanAt && <div className="card mb-4 p-3 text-sm text-muted">⏳ موتور تحلیل در حال اولین اسکن بازار است؛ چند لحظه دیگر نتایج ظاهر می‌شوند.</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="سیگنال‌های فعال" value={fa(active.length)} tone="brand" />
        <Stat label="سیگنال خرید" value={fa(buy)} tone="up" />
        <Stat label="سیگنال فروش" value={fa(sell)} tone="down" />
        <Stat label="حداقل قدرت صدور" value={`${fa(sys.minConfidence)}٪`} />
        <div className="card col-span-2 px-4 py-3 lg:col-span-1">
          <div className="text-xs text-muted">آخرین اسکن موتور</div>
          <div className="mt-1 text-sm font-bold">{sys.scanning ? "در حال اسکن…" : sys.lastScanAt ? timeAgo(sys.lastScanAt) : "—"}</div>
          <div className="text-[0.68rem] text-muted">هر {fa(sys.scanIntervalSec)} ثانیه • تایم‌فریم‌ها: <span className="ltr">{sys.timeframes.join(" ")}</span></div>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <input className="min-w-40 flex-1" placeholder="🔍 جستجوی ارز (DOGE، Pepe …)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex overflow-hidden rounded-xl border border-line">
          {(["ALL", "BUY", "SELL", "NEUTRAL"] as const).map((d) => (
            <button key={d} onClick={() => setDir(d)} className={`px-3 py-2 text-xs font-bold transition ${dir === d ? (d === "BUY" ? "bg-up/20 text-up" : d === "SELL" ? "bg-down/20 text-down" : "bg-brand/20 text-brand") : "text-muted hover:bg-white/5"}`}>
              {d === "ALL" ? "همه" : d === "BUY" ? "خرید" : d === "SELL" ? "فروش" : "خنثی"}
            </button>
          ))}
        </div>
        <select value={tf} onChange={(e) => setTf(e.target.value)} aria-label="تایم‌فریم">
          <option value="all">همه تایم‌فریم‌ها</option>
          {sys.timeframes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="مرتب‌سازی">
          <option value="strength">مرتب‌سازی: قدرت سیگنال</option>
          <option value="change">تغییرات ۲۴ساعته</option>
          <option value="volume">حجم معاملات</option>
          <option value="cap">ارزش بازار</option>
          <option value="recent">جدیدترین سیگنال</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted">
          قدرت ≥ <span className="w-6 font-bold text-white">{fa(minStr)}</span>
          <input type="range" min={0} max={100} step={5} value={minStr} onChange={(e) => setMinStr(Number(e.target.value))} className="w-24" />
        </label>
        <div className="mr-auto flex overflow-hidden rounded-xl border border-line">
          {(["table", "cards"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-2 text-xs font-bold ${view === v ? "bg-brand/20 text-brand" : "text-muted hover:bg-white/5"}`}>
              {v === "table" ? "▤ جدول" : "▦ کارت"}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        rows.length === 0 ? (
          <Empty>ارزی با این فیلترها یافت نشد.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse">
              <thead className="border-b border-line bg-panel/60">
                <tr>
                  {["#", "ارز", "قیمت", "۲۴h", "حجم", "ارزش بازار", "نمودار ۷روزه", "حمایت / مقاومت", "قدرت", "جهت", "ورود", "حد ضرر", "TP1", "TP2", "TP3", "R/R", "زمان صدور", ""].map((h, i) => (
                    <th key={i} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.symbol} className="border-b border-line/60 transition hover:bg-white/[0.03]">
                    <td className="td text-muted">{fa(i + 1)}</td>
                    <td className="td sticky right-0 z-10 bg-panel">
                      <div className="flex items-center gap-2.5">
                        <CoinLogo symbol={r.symbol} src={r.info?.image} />
                        <div>
                          <div className="font-bold">{r.symbol}</div>
                          <div className="text-[0.68rem] text-muted">{r.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="td font-bold"><LivePrice value={r.t?.price} /></td>
                    <td className={`td ${r.t ? (r.t.change24h >= 0 ? "text-up" : "text-down") : ""}`}><span className="ltr font-semibold">{fmtPct(r.t?.change24h)}</span></td>
                    <td className="td"><span className="ltr">${fmtCompact(r.t?.volume24h)}</span></td>
                    <td className="td"><span className="ltr">{r.info?.marketCap ? `$${fmtCompact(r.info.marketCap)}` : "—"}</span></td>
                    <td className="td"><Spark data={r.info?.sparkline ?? []} /></td>
                    <td className="td text-xs">
                      <div className="text-up"><span className="ltr">{fmtPrice(r.support)}</span></div>
                      <div className="text-down"><span className="ltr">{fmtPrice(r.resistance)}</span></div>
                    </td>
                    <td className="td"><div className="flex items-center gap-2"><Strength value={r.strength} dir={r.direction} size={38} />{!r.sig && <span className="text-[0.62rem] text-muted">تمایل</span>}</div></td>
                    <td className="td">
                      <div className="flex flex-col items-start gap-1">
                        <DirBadge dir={r.direction} size="sm" />
                        <span className="text-[0.62rem] text-muted"><span className="ltr">{r.sig?.timeframe ?? r.snapTf ?? ""}</span>{r.extra > 0 && ` +${fa(r.extra)} سیگنال دیگر`}</span>
                      </div>
                    </td>
                    <td className="td"><span className="ltr">{fmtPrice(r.sig?.entry)}</span></td>
                    <td className="td text-down"><span className="ltr">{fmtPrice(r.sig?.currentSl)}</span></td>
                    {[r.sig?.tp1, r.sig?.tp2, r.sig?.tp3].map((tp, k) => (
                      <td key={k} className="td text-up"><span className="ltr">{fmtPrice(tp)}</span>{r.sig && r.sig.tpHit > k && <span className="mr-1">✓</span>}</td>
                    ))}
                    <td className="td"><span className="ltr">{r.sig ? `1:${r.sig.riskReward.toFixed(2)}` : "—"}</span></td>
                    <td className="td text-xs text-muted">{r.sig ? fmtDate(r.sig.createdAt) : "بدون سیگنال فعال"}</td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button className="btn !px-2 !py-1 text-xs" title="تحلیل هوش مصنوعی" onClick={() => setAi({ symbol: r.symbol, tf: r.sig?.timeframe ?? r.snapTf ?? sys.timeframes[0] })}>🤖</button>
                        <Link className="btn !px-2 !py-1 text-xs" title="نمودار" href={`/chart?symbol=${r.symbol}&tf=${r.sig?.timeframe ?? r.snapTf ?? "15m"}`}>📈</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex gap-2 text-xs">
            {(["active", "all"] as const).map((s) => (
              <button key={s} className={`btn !py-1 ${statusF === s ? "!border-brand/50 !text-brand" : ""}`} onClick={() => setStatusF(s)}>
                {s === "active" ? "فقط فعال" : "همه وضعیت‌ها (اخیر)"}
              </button>
            ))}
          </div>
          {cards.length === 0 ? (
            <Empty>
              هیچ سیگنالی با این فیلترها وجود ندارد.
              <br />
              <span className="text-xs">سیگنال‌ها فقط وقتی صادر می‌شوند که قدرت تحلیل از {fa(sys.minConfidence)}٪ بگذرد؛ سیگنال ساختگی تولید نمی‌شود.</span>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {cards.map((s) => (
                <SignalCard key={s.id} s={s} price={data.tickers[s.symbol]?.price ?? null} logo={data.info[s.symbol]?.image} spark={data.info[s.symbol]?.sparkline} onAi={() => setAi({ symbol: s.symbol, tf: s.timeframe })} />
              ))}
            </div>
          )}
        </>
      )}
      {data.infoError && <p className="mt-3 text-xs text-warn">ℹ️ ارزش بازار و لوگو از CoinGecko در دسترس نیست ({data.infoError}); قیمت و تحلیل‌ها از صرافی دریافت می‌شوند.</p>}
      {ai && <AiModal symbol={ai.symbol} timeframe={ai.tf} onClose={() => setAi(null)} />}
    </div>
  );
}
