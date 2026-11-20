"use client";
import { useState } from "react";
import { api, usePoll } from "@/lib/hooks";
import { fa, fmtDate, fmtPrice } from "@/lib/format";
import { STATUS_LABEL, TIMEFRAMES, type SignalDTO } from "@/lib/types";
import { DirBadge, Empty, Pnl, Spinner, StatusBadge } from "../ui";
import { Field, Msg, Section, useAction } from "./AdminUi";

export default function AdminSignals({ coins }: { coins: string[] }) {
  const [status, setStatus] = useState("");
  const { data, loading, refresh } = usePoll<{ items: SignalDTO[]; total: number }>(`/api/admin/signals?limit=100${status ? `&status=${status}` : ""}`, 8000);
  const act = useAction();
  const form = useAction();
  const [f, setF] = useState({ symbol: coins[0] ?? "DOGE", direction: "BUY", timeframe: "1h", entry: "", stopLoss: "", tp1: "", tp2: "", tp3: "", confidence: "70", reason: "", publish: true });
  const doAct = (id: number, action: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    act.run(async () => {
      await api("/api/admin/signals", "PATCH", { id, action });
      await refresh();
    });
  };
  const setField = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  return (
    <div>
      <Section title="ثبت سیگنال دستی" sub="سیگنال دستی با برچسب «دستی» ثبت و مانند سیگنال‌های موتور ردیابی می‌شود (TP/SL خودکار).">
        <form
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.run(async () => {
              await api("/api/admin/signals", "POST", { ...f });
              await refresh();
              return "سیگنال ثبت شد ✓";
            });
          }}
        >
          <Field label="ارز"><select className="w-full" value={f.symbol} onChange={(e) => setField("symbol", e.target.value)}>{coins.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="جهت"><select className="w-full" value={f.direction} onChange={(e) => setField("direction", e.target.value)}><option>BUY</option><option>SELL</option></select></Field>
          <Field label="تایم‌فریم"><select className="w-full" value={f.timeframe} onChange={(e) => setField("timeframe", e.target.value)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="قدرت (٪)"><input className="w-full" type="number" min={1} max={100} value={f.confidence} onChange={(e) => setField("confidence", e.target.value)} /></Field>
          {(["entry", "stopLoss", "tp1", "tp2", "tp3"] as const).map((k) => (
            <Field key={k} label={{ entry: "قیمت ورود", stopLoss: "حد ضرر", tp1: "TP1", tp2: "TP2", tp3: "TP3" }[k]}>
              <input className="ltr w-full" required type="number" step="any" value={f[k]} onChange={(e) => setField(k, e.target.value)} />
            </Field>
          ))}
          <div className="col-span-2"><Field label="توضیح / دلیل"><input className="w-full" value={f.reason} onChange={(e) => setField("reason", e.target.value)} maxLength={500} /></Field></div>
          <label className="col-span-2 flex items-center gap-2 text-xs md:col-span-2"><input type="checkbox" checked={f.publish} onChange={(e) => setField("publish", e.target.checked)} /> بلافاصله منتشر شود (در غیر این صورت «در انتظار انتشار»)</label>
          <div className="col-span-2 flex items-center gap-3 md:col-span-2"><button className="btn btn-brand" disabled={form.busy}>ثبت سیگنال</button><Msg msg={form.msg} /></div>
        </form>
      </Section>

      <Section
        title="سیگنال‌ها و تاریخچه معاملات"
        sub="انتشار سیگنال‌های در انتظار، توقف معاملات فعال و بررسی نتیجه معاملات"
        right={
          <div className="flex items-center gap-2">
            <Msg msg={act.msg} />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              {(["pending", "active", "success", "failed", "expired", "stopped"] as const).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </div>
        }
      >
        {loading && !data ? <Spinner /> : !data?.items.length ? <Empty>سیگنالی وجود ندارد.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] border-collapse">
              <thead className="border-b border-line"><tr>{["زمان", "ارز", "جهت", "TF", "ورود", "SL", "TP1", "قدرت", "منبع", "نتیجه", "وضعیت", "عملیات"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-line/50 hover:bg-white/[0.03]" title={s.reason}>
                    <td className="td text-xs text-muted">{fmtDate(s.createdAt)}</td>
                    <td className="td font-bold">{s.symbol}</td>
                    <td className="td"><DirBadge dir={s.direction} size="sm" /></td>
                    <td className="td"><span className="ltr">{s.timeframe}</span></td>
                    <td className="td"><span className="ltr">{fmtPrice(s.entry)}</span></td>
                    <td className="td text-down"><span className="ltr">{fmtPrice(s.currentSl)}</span></td>
                    <td className="td text-up"><span className="ltr">{fmtPrice(s.tp1)}</span></td>
                    <td className="td">{fa(s.confidence)}٪</td>
                    <td className="td text-xs">{s.source === "manual" ? "دستی" : "موتور"}</td>
                    <td className="td"><Pnl value={s.pnlPct} /></td>
                    <td className="td"><StatusBadge status={s.status} /></td>
                    <td className="td">
                      <div className="flex gap-1">
                        {s.status === "pending" && <button className="btn btn-up !px-2 !py-1 text-xs" disabled={act.busy} onClick={() => doAct(s.id, "publish")}>انتشار</button>}
                        {(s.status === "active" || s.status === "pending") && <button className="btn btn-down !px-2 !py-1 text-xs" disabled={act.busy} onClick={() => doAct(s.id, "stop", "این سیگنال متوقف شود؟")}>توقف</button>}
                        <button className="btn !px-2 !py-1 text-xs" disabled={act.busy} onClick={() => doAct(s.id, "delete", "سیگنال برای همیشه حذف شود؟")}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
