"use client";
import { useMemo, useState } from "react";
import { usePoll } from "@/lib/hooks";
import { fa, fmtDate, fmtPrice } from "@/lib/format";
import { STATUS_LABEL, TIMEFRAMES, type SignalDTO } from "@/lib/types";
import { DirBadge, Empty, ErrorBox, PageTitle, Pnl, Spinner, Stat, StatusBadge } from "./ui";

type Resp = {
  items: SignalDTO[];
  total: number;
  stats: { total: number; wins: number; losses: number; expired: number; active: number; sumPnl: number; avgPnl: number; winRate: number | null };
};
const PAGE = 25;

export default function HistoryView() {
  const [f, setF] = useState({ from: "", to: "", symbol: "", tf: "", dir: "", status: "" });
  const [page, setPage] = useState(0);
  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [f]);
  const url = `/api/signals?${query}&limit=${PAGE}&offset=${page * PAGE}`;
  const { data, error, loading, refresh } = usePoll<Resp>(url, 15000);
  const set = (k: keyof typeof f, v: string) => {
    setF((o) => ({ ...o, [k]: v }));
    setPage(0);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const s = data?.stats;

  return (
    <div>
      <PageTitle
        title="تاریخچه و آرشیو سیگنال‌ها"
        sub="تمام سیگنال‌های صادرشده با نتیجه نهایی، سود و زیان و درصد موفقیت"
        right={
          <div className="flex gap-2">
            <a className="btn" href={`/api/export?format=csv&${query}`} download>⬇ خروجی CSV</a>
            <a className="btn btn-brand" href={`/api/export?format=xls&${query}`} download>⬇ خروجی Excel</a>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="کل سیگنال‌ها" value={fa(s?.total ?? 0)} />
        <Stat label="درصد موفقیت" value={s?.winRate != null ? `${s.winRate.toFixed(1)}٪` : "—"} tone={s?.winRate != null && s.winRate >= 50 ? "up" : "down"} />
        <Stat label="موفق / ناموفق" value={`${fa(s?.wins ?? 0)} / ${fa(s?.losses ?? 0)}`} />
        <Stat label="میانگین سود/زیان" value={<Pnl value={s?.avgPnl ?? 0} />} />
        <Stat label="مجموع سود/زیان" value={<Pnl value={s?.sumPnl ?? 0} />} />
      </div>

      <div className="card mb-4 grid grid-cols-2 gap-3 p-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-muted">از تاریخ<input type="date" className="mt-1 w-full" value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="text-xs text-muted">تا تاریخ<input type="date" className="mt-1 w-full" value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
        <label className="text-xs text-muted">ارز<input className="mt-1 w-full uppercase" placeholder="DOGE" value={f.symbol} onChange={(e) => set("symbol", e.target.value.trim())} /></label>
        <label className="text-xs text-muted">تایم‌فریم
          <select className="mt-1 w-full" value={f.tf} onChange={(e) => set("tf", e.target.value)}>
            <option value="">همه</option>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">جهت
          <select className="mt-1 w-full" value={f.dir} onChange={(e) => set("dir", e.target.value)}>
            <option value="">همه</option><option value="BUY">BUY</option><option value="SELL">SELL</option>
          </select>
        </label>
        <label className="text-xs text-muted">وضعیت
          <select className="mt-1 w-full" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">همه</option>
            {(["active", "success", "failed", "expired", "stopped"] as const).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
        </label>
      </div>

      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={refresh} /> : !data || data.items.length === 0 ? (
        <Empty>سیگنالی با این فیلترها در آرشیو وجود ندارد.</Empty>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead className="border-b border-line bg-panel/60">
                <tr>{["زمان صدور", "ارز", "جهت", "TF", "ورود", "حد ضرر", "TP1 / TP2 / TP3", "قدرت", "R/R", "TP لمس‌شده", "خروج", "سود/زیان نهایی", "وضعیت"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id} className="border-b border-line/60 hover:bg-white/[0.03]" title={x.reason}>
                    <td className="td text-xs text-muted">{fmtDate(x.createdAt)}</td>
                    <td className="td font-bold">{x.symbol}{x.source === "manual" && <span className="mr-1 text-[0.6rem] text-warn">دستی</span>}</td>
                    <td className="td"><DirBadge dir={x.direction} size="sm" /></td>
                    <td className="td"><span className="ltr">{x.timeframe}</span></td>
                    <td className="td"><span className="ltr">{fmtPrice(x.entry)}</span></td>
                    <td className="td text-down"><span className="ltr">{fmtPrice(x.stopLoss)}</span></td>
                    <td className="td text-up text-xs"><span className="ltr">{fmtPrice(x.tp1)} / {fmtPrice(x.tp2)} / {fmtPrice(x.tp3)}</span></td>
                    <td className="td">{fa(x.confidence)}٪</td>
                    <td className="td"><span className="ltr">1:{x.riskReward.toFixed(2)}</span></td>
                    <td className="td">{fa(x.tpHit)}/۳</td>
                    <td className="td"><span className="ltr">{fmtPrice(x.closePrice)}</span></td>
                    <td className="td"><Pnl value={x.pnlPct} /></td>
                    <td className="td"><StatusBadge status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>قبلی</button>
            <span className="text-muted">صفحه {fa(page + 1)} از {fa(pages)} ({fa(data.total)} سیگنال)</span>
            <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
          </div>
        </>
      )}
    </div>
  );
}
