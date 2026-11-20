"use client";
import { useState } from "react";
import { fmtPrice } from "@/lib/format";
import { STATUS_LABEL, type SignalDTO, type SignalStatus } from "@/lib/types";

export function CoinLogo({ symbol, src, size = 34 }: { symbol: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hue = [...symbol].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  if (src && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={symbol} width={size} height={size} onError={() => setFailed(true)} className="rounded-full bg-panel2 object-cover" style={{ width: size, height: size }} />
    );
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full text-[0.7rem] font-bold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}

export function DirBadge({ dir, size = "md" }: { dir: "BUY" | "SELL" | "NEUTRAL"; size?: "sm" | "md" }) {
  const cls =
    dir === "BUY"
      ? "bg-up/15 text-up border-up/40"
      : dir === "SELL"
        ? "bg-down/15 text-down border-down/40"
        : "bg-white/5 text-muted border-line";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border font-bold ${cls} ${size === "sm" ? "px-2 py-0.5 text-[0.68rem]" : "px-2.5 py-1 text-xs"}`}>
      {dir === "BUY" ? "▲" : dir === "SELL" ? "▼" : "●"} {dir === "NEUTRAL" ? "NEUTRAL" : dir}
    </span>
  );
}

const STATUS_CLS: Record<SignalStatus, string> = {
  active: "bg-brand/15 text-brand border-brand/40",
  success: "bg-up/15 text-up border-up/40",
  failed: "bg-down/15 text-down border-down/40",
  expired: "bg-white/5 text-muted border-line",
  stopped: "bg-warn/15 text-warn border-warn/40",
  pending: "bg-warn/15 text-warn border-warn/40",
};

export function StatusBadge({ status }: { status: SignalStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_CLS[status]}`}>
      {status === "active" && <span className="inline-block size-1.5 animate-pulse-dot rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Strength({ value, dir, size = 44 }: { value: number; dir: "BUY" | "SELL" | "NEUTRAL"; size?: number }) {
  const color = dir === "BUY" ? "#16c784" : dir === "SELL" ? "#ea3943" : "#8794ab";
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} title={`قدرت سیگنال ${value}٪`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#222c3f" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <span className="absolute text-[0.72rem] font-bold" style={{ color }}>{value}</span>
    </span>
  );
}

export function Spark({ data, w = 110, h = 34 }: { data: number[]; w?: number; h?: number }) {
  if (!data || data.length < 2) return <span className="text-xs text-muted">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  const up = data[data.length - 1] >= data[0];
  const color = up ? "#16c784" : "#ea3943";
  const id = `g${Math.abs(Math.round(data[0] * 1e6 + data.length))}${up ? "u" : "d"}`;
  return (
    <svg width={w} height={h} className="overflow-visible" style={{ direction: "ltr" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Price ladder: SL — Entry — TP1/2/3 with live price marker */
export function Ladder({ s, price }: { s: Pick<SignalDTO, "stopLoss" | "currentSl" | "entry" | "tp1" | "tp2" | "tp3" | "tpHit">; price: number | null }) {
  const vals = [s.stopLoss, s.entry, s.tp1, s.tp2, s.tp3, ...(price ? [price] : [])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pos = (v: number) => 4 + ((v - min) / span) * 92;
  const lossFrom = Math.min(pos(s.stopLoss), pos(s.entry));
  const lossW = Math.abs(pos(s.stopLoss) - pos(s.entry));
  const winFrom = Math.min(pos(s.entry), pos(s.tp3));
  const winW = Math.abs(pos(s.entry) - pos(s.tp3));
  const marks: { label: string; v: number; c: string; hit?: boolean }[] = [
    { label: "SL", v: s.stopLoss, c: "#ea3943" },
    { label: "E", v: s.entry, c: "#8794ab" },
    { label: "T1", v: s.tp1, c: "#16c784", hit: s.tpHit >= 1 },
    { label: "T2", v: s.tp2, c: "#16c784", hit: s.tpHit >= 2 },
    { label: "T3", v: s.tp3, c: "#16c784", hit: s.tpHit >= 3 },
  ];
  return (
    <div dir="ltr" className="relative h-10 w-full select-none">
      <div className="absolute top-3 h-1.5 rounded-full bg-down/40" style={{ left: `${lossFrom}%`, width: `${lossW}%` }} />
      <div className="absolute top-3 h-1.5 rounded-full bg-up/40" style={{ left: `${winFrom}%`, width: `${winW}%` }} />
      {marks.map((m) => (
        <div key={m.label} className="absolute top-1" style={{ left: `${pos(m.v)}%` }}>
          <span className="absolute -translate-x-1/2 rounded-full" style={{ top: 6, width: 8, height: 8, background: m.hit ? m.c : "#0f1520", border: `2px solid ${m.c}` }} />
          <span className="absolute top-5 -translate-x-1/2 text-[0.6rem] font-semibold" style={{ color: m.c }}>{m.label}</span>
        </div>
      ))}
      {price !== null && (
        <div className="absolute top-0 transition-all duration-700" style={{ left: `${pos(price)}%` }} title={`قیمت فعلی ${fmtPrice(price)}`}>
          <span className="absolute -translate-x-1/2 text-[0.65rem] leading-none text-white">▼</span>
        </div>
      )}
    </div>
  );
}

export function Pnl({ value, suffix = "%", digits = 2, prefix = "" }: { value: number | null | undefined; suffix?: string; digits?: number; prefix?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-muted">—</span>;
  const cls = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted";
  return (
    <span className={`ltr font-semibold ${cls}`}>
      {value > 0 ? "+" : value < 0 ? "-" : ""}
      {prefix}
      {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label ?? "در حال بارگذاری…"}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-down/40 p-4 text-sm text-down">
      <span>⚠️ {message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-10 text-center text-sm text-muted">{children}</div>;
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "up" | "down" | "brand" }) {
  const cls = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "brand" ? "text-brand" : "text-white";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full border transition ${checked ? "border-up/50 bg-up/30" : "border-line bg-panel2"}`}
      >
        <span className={`absolute top-0.5 size-4.5 rounded-full transition-all ${checked ? "right-0.5 bg-up" : "right-5.5 bg-muted"}`} style={{ width: 18, height: 18 }} />
      </button>
      {label}
    </label>
  );
}
