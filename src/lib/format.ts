const faNum = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export function fmtPrice(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  if (p >= 0.0001) return p.toFixed(7);
  if (p <= 0) return "0";
  return p.toFixed(Math.min(14, -Math.floor(Math.log10(p)) + 3));
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${signed && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

export function fa(n: number): string {
  return faNum.format(n);
}

const dtf = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
export function fmtDate(iso: string | number | Date | null | undefined): string {
  if (!iso) return "—";
  return dtf.format(new Date(iso));
}

export function fmtDuration(fromIso: string | number, to: number = Date.now()): string {
  const s = Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${fa(d)} روز و ${fa(h)} ساعت`;
  if (h > 0) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  if (m > 0) return `${fa(m)} دقیقه`;
  return `${fa(s)} ثانیه`;
}

export function timeAgo(iso: string | number): string {
  return `${fmtDuration(iso)} پیش`;
}
