"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import type { SignalDTO } from "@/lib/types";
import { CoinLogo, DirBadge, Ladder, Pnl, Spark, StatusBadge, Strength } from "./ui";

export function LivePrice({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  const prev = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (value == null) return;
    if (prev.current !== null && value !== prev.current && ref.current) {
      const el = ref.current;
      el.classList.remove("flash-up", "flash-down");
      void el.offsetWidth;
      el.classList.add(value > prev.current ? "flash-up" : "flash-down");
    }
    prev.current = value;
  }, [value]);
  return (
    <span ref={ref} className={`ltr rounded px-1 ${className}`}>
      {value == null ? "—" : fmtPrice(value)}
    </span>
  );
}

const dist = (price: number | null, target: number) => (price ? ((target - price) / price) * 100 : null);

export default function SignalCard({
  s,
  price,
  logo,
  spark,
  onAi,
}: {
  s: SignalDTO;
  price: number | null;
  logo?: string | null;
  spark?: number[];
  onAi: () => void;
}) {
  const live = s.status === "active";
  const tone = s.direction === "BUY" ? "from-up/10" : "from-down/10";
  return (
    <div className={`card relative animate-fade-in overflow-hidden bg-gradient-to-b ${tone} to-transparent p-4`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${s.direction === "BUY" ? "bg-up" : "bg-down"}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={s.symbol} src={logo} size={40} />
          <div>
            <div className="flex items-center gap-2 font-extrabold">
              {s.symbol}<span className="text-xs font-medium text-muted">/USDT</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <DirBadge dir={s.direction} size="sm" />
              <span className="rounded-md border border-line px-1.5 py-0.5 text-[0.68rem] text-muted"><span className="ltr">{s.timeframe}</span></span>
              <StatusBadge status={s.status} />
              {s.source === "manual" && <span className="rounded-md border border-warn/40 px-1.5 py-0.5 text-[0.65rem] text-warn">دستی</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Strength value={s.confidence} dir={s.direction} size={52} />
          <span className="text-[0.6rem] text-muted">قدرت</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.68rem] text-muted">قیمت لحظه‌ای</div>
          <div className="font-bold"><LivePrice value={price} /></div>
        </div>
        {spark && spark.length > 1 && <Spark data={spark} w={120} h={34} />}
        <div className="text-left">
          <div className="text-[0.68rem] text-muted">{live ? "سود/زیان فعلی" : "نتیجه نهایی"}</div>
          <Pnl value={live ? (price !== null ? ((price - s.entry) / s.entry) * 100 * (s.direction === "BUY" ? 1 : -1) : null) : s.pnlPct} />
        </div>
      </div>

      <div className="mt-2"><Ladder s={s} price={live ? price : s.closePrice} /></div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Row k="ورود (Entry)" v={fmtPrice(s.entry)} />
        <Row k="حد ضرر (SL)" v={fmtPrice(s.currentSl)} c="text-down" extra={s.currentSl !== s.stopLoss ? "↻" : undefined} />
        {[s.tp1, s.tp2, s.tp3].map((tp, i) => (
          <Row key={i} k={`TP${i + 1}${s.tpHit > i ? " ✓" : ""}`} v={fmtPrice(tp)} c="text-up" extra={live && s.tpHit <= i ? fmtPct(Math.abs(dist(price, tp) ?? NaN), false) : undefined} />
        ))}
        <Row k="ریسک/ریوارد" v={`1 : ${s.riskReward.toFixed(2)}`} />
      </div>

      <p className="mt-3 line-clamp-2 text-[0.72rem] leading-5 text-muted" title={s.reason}>{s.reason}</p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-[0.68rem] text-muted">{fmtDate(s.createdAt)}</span>
        <div className="flex gap-1.5">
          <button className="btn !px-2.5 !py-1 text-xs" onClick={onAi}>🤖 تحلیل AI</button>
          <Link href={`/chart?symbol=${s.symbol}&tf=${s.timeframe}`} className="btn !px-2.5 !py-1 text-xs">📈 نمودار</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, c = "", extra }: { k: string; v: string; c?: string; extra?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/50 pb-1">
      <span className="text-muted">{k}</span>
      <span className={`ltr font-semibold ${c}`}>
        {v}
        {extra && <span className="mr-1 text-[0.62rem] font-normal text-muted"> {extra}</span>}
      </span>
    </div>
  );
}
