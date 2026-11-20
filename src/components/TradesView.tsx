"use client";
import Link from "next/link";
import { useState } from "react";
import { useNow, usePoll } from "@/lib/hooks";
import { fa, fmtDate, fmtDuration, fmtPrice, fmtUsd } from "@/lib/format";
import type { SignalDTO } from "@/lib/types";
import AiModal from "./AiModal";
import { LivePrice } from "./SignalCard";
import { CoinLogo, DirBadge, Empty, ErrorBox, Ladder, PageTitle, Pnl, Spinner, Stat, StatusBadge } from "./ui";

type Trade = { signal: SignalDTO; price: number | null; pnlPct: number | null; pnlUsd: number | null };
type Resp = { trades: Trade[]; closed: SignalDTO[]; positionSizeUsd: number; totalUsd: number; source: string | null; error: string | null };

export default function TradesView() {
  const { data, error, loading, refresh } = usePoll<Resp>("/api/trades", 4000);
  const now = useNow(1000);
  const [ai, setAi] = useState<{ symbol: string; tf: string } | null>(null);

  if (loading && !data) return <Spinner label="در حال دریافت معاملات…" />;
  if (!data) return <ErrorBox message={error ?? "خطا"} onRetry={refresh} />;

  const wins = data.trades.filter((t) => (t.pnlPct ?? 0) > 0).length;
  return (
    <div>
      <PageTitle
        title="معاملات باز (Live)"
        sub={`سود و زیان لحظه‌ای بر اساس قیمت زنده — حجم فرضی هر معامله ${data.positionSizeUsd.toLocaleString("en-US")} دلار`}
        right={
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${data.source ? "border-up/40 text-up" : "border-down/40 text-down"}`}>
            <span className="inline-block size-2 animate-pulse-dot rounded-full bg-current" />
            {data.source ? `Real-Time • ${data.source.toUpperCase()}` : "قیمت زنده در دسترس نیست"}
          </span>
        }
      />
      {(data.error || error) && <div className="mb-4"><ErrorBox message={data.error ?? error ?? ""} onRetry={refresh} /></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="معاملات باز" value={fa(data.trades.length)} tone="brand" />
        <Stat label="در سود" value={fa(wins)} tone="up" />
        <Stat label="در زیان" value={fa(data.trades.length - wins)} tone="down" />
        <Stat label="سود/زیان کل (دلار)" value={<span className="ltr">{fmtUsd(data.totalUsd)}</span>} tone={data.totalUsd >= 0 ? "up" : "down"} />
      </div>

      {data.trades.length === 0 ? (
        <Empty>در حال حاضر معامله بازی وجود ندارد. با صدور سیگنال جدید توسط موتور تحلیل، معامله به‌صورت خودکار در این بخش ردیابی می‌شود.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse">
            <thead className="border-b border-line bg-panel/60">
              <tr>
                {["ارز", "جهت", "ورود", "قیمت فعلی", "حد ضرر", "اهداف", "موقعیت قیمت", "سود/زیان ٪", "سود/زیان $", "مدت باز بودن", "وضعیت", ""].map((h, i) => <th key={i} className="th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.trades.map(({ signal: s, price, pnlPct, pnlUsd }) => (
                <tr key={s.id} className="border-b border-line/60 hover:bg-white/[0.03]">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <CoinLogo symbol={s.symbol} size={30} />
                      <div>
                        <div className="font-bold">{s.symbol}<span className="text-[0.68rem] font-normal text-muted">/USDT</span></div>
                        <div className="text-[0.65rem] text-muted"><span className="ltr">{s.timeframe}</span> • قدرت {fa(s.confidence)}٪</div>
                      </div>
                    </div>
                  </td>
                  <td className="td"><DirBadge dir={s.direction} size="sm" /></td>
                  <td className="td"><span className="ltr">{fmtPrice(s.entry)}</span></td>
                  <td className="td font-bold"><LivePrice value={price} /></td>
                  <td className="td text-down"><span className="ltr">{fmtPrice(s.currentSl)}</span>{s.currentSl !== s.stopLoss && <span className="mr-1 text-[0.62rem] text-muted">(منتقل‌شده)</span>}</td>
                  <td className="td text-xs">
                    {[s.tp1, s.tp2, s.tp3].map((tp, i) => (
                      <div key={i} className={s.tpHit > i ? "text-up" : "text-muted"}><span className="ltr">T{i + 1} {fmtPrice(tp)}</span> {s.tpHit > i && "✓"}</div>
                    ))}
                  </td>
                  <td className="td w-56"><Ladder s={s} price={price} /></td>
                  <td className="td text-base"><Pnl value={pnlPct} /></td>
                  <td className="td"><Pnl value={pnlUsd} suffix="" prefix="$" /></td>
                  <td className="td text-xs">{fmtDuration(s.createdAt, now)}</td>
                  <td className="td"><StatusBadge status={s.status} /></td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="btn !px-2 !py-1 text-xs" onClick={() => setAi({ symbol: s.symbol, tf: s.timeframe })}>🤖</button>
                      <Link className="btn !px-2 !py-1 text-xs" href={`/chart?symbol=${s.symbol}&tf=${s.timeframe}`}>📈</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        مدیریت پله‌ای: با رسیدن به TP1 حد ضرر به نقطه ورود و با TP2 به TP1 منتقل می‌شود. سود/زیان لحظه‌ای ترکیبی از بخش‌های بسته‌شده (هر TP یک‌سوم) و بخش باز است.
      </p>

      {data.closed.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold">آخرین معاملات بسته‌شده</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead className="border-b border-line bg-panel/60">
                <tr>{["ارز", "جهت", "ورود", "خروج", "TP لمس‌شده", "نتیجه", "وضعیت", "بسته‌شده در"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.closed.map((s) => (
                  <tr key={s.id} className="border-b border-line/60">
                    <td className="td font-bold">{s.symbol} <span className="ltr text-xs font-normal text-muted">{s.timeframe}</span></td>
                    <td className="td"><DirBadge dir={s.direction} size="sm" /></td>
                    <td className="td"><span className="ltr">{fmtPrice(s.entry)}</span></td>
                    <td className="td"><span className="ltr">{fmtPrice(s.closePrice)}</span></td>
                    <td className="td">{fa(s.tpHit)} / ۳</td>
                    <td className="td"><Pnl value={s.pnlPct} /></td>
                    <td className="td"><StatusBadge status={s.status} /></td>
                    <td className="td text-xs text-muted">{fmtDate(s.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {ai && <AiModal symbol={ai.symbol} timeframe={ai.tf} onClose={() => setAi(null)} />}
    </div>
  );
}
