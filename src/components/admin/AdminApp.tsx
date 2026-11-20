"use client";
import { useCallback, useEffect, useState } from "react";
import { api, usePoll, useNow } from "@/lib/hooks";
import { fa, fmtDate, timeAgo } from "@/lib/format";
import { SOURCE_NAMES, type SourceId } from "@/lib/types";
import { ErrorBox, Spinner, Toggle } from "../ui";
import AdminApi from "./AdminApi";
import AdminEngine from "./AdminEngine";
import AdminSignals from "./AdminSignals";
import { Field, Msg, Section, useAction, type AdminCfg, type CfgCtx } from "./AdminUi";

const TABS = [
  { id: "overview", label: "وضعیت سیستم" },
  { id: "coins", label: "ارزها" },
  { id: "sources", label: "منابع داده" },
  { id: "engine", label: "موتور و ماژول‌ها" },
  { id: "signals", label: "سیگنال‌ها و معاملات" },
  { id: "api", label: "تنظیمات API" },
] as const;

type SysResp = {
  db: { ok: boolean; latencyMs: number };
  uptimeSec: number;
  memoryMb: number;
  node: string;
  engine: { enabled: boolean; scanning: boolean; tracking: boolean; lastScanAt: number; lastTrackAt: number; lastScanError: string | null; lastScan: { scanned: number; generated: number; errors: string[]; durationMs: number } | null };
  sources: { id: SourceId; enabled: boolean; primary: boolean; ok: number; fail: number; lastLatencyMs: number | null; lastError: string | null; lastSuccessAt: number | null }[];
  counts: { coins: number; active: number; pending: number; total: number };
  runs: { id: number; startedAt: string; durationMs: number; scanned: number; generated: number; errors: string[] | null }[];
  defaultPassword: boolean;
};

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const a = useAction();
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <form
        className="card animate-fade-in space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(async () => {
            await api("/api/admin/auth", "POST", { password: pw });
            onDone();
          });
        }}
      >
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-up text-2xl">🔐</div>
          <h1 className="text-lg font-extrabold">ورود مدیر</h1>
          <p className="mt-1 text-xs text-muted">برای دسترسی به پنل مدیریت Meme Radar Pro رمز عبور را وارد کنید.</p>
        </div>
        <input type="password" autoFocus className="w-full" placeholder="رمز عبور" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        <button className="btn btn-brand w-full" disabled={a.busy || !pw}>{a.busy ? "در حال ورود…" : "ورود"}</button>
        {a.msg && !a.msg.ok && <p className="text-center text-xs text-down">{a.msg.text}</p>}
      </form>
    </div>
  );
}

function Overview({ defaultPassword }: { defaultPassword: boolean }) {
  const { data, error, loading, refresh } = usePoll<SysResp>("/api/admin/system", 5000);
  const now = useNow(1000);
  const a = useAction();
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBox message={error ?? "خطا"} onRetry={refresh} />;
  const up = data.uptimeSec;
  return (
    <div>
      {(defaultPassword || data.defaultPassword) && (
        <div className="card mb-4 border-warn/50 p-3 text-sm text-warn">⚠️ هنوز از رمز پیش‌فرض مدیر استفاده می‌شود. متغیر محیطی <span className="ltr">ADMIN_PASSWORD</span> را تنظیم کنید.</div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["پایگاه داده", data.db.ok ? `آنلاین • ${fa(data.db.latencyMs)}ms` : "قطع", data.db.ok],
          ["موتور تحلیل", !data.engine.enabled ? "غیرفعال" : data.engine.scanning ? "در حال اسکن" : "فعال", data.engine.enabled],
          ["زمان فعالیت سرور", `${fa(Math.floor(up / 3600))} ساعت ${fa(Math.floor((up % 3600) / 60))} دقیقه`, true],
          ["حافظه / Node", `${fa(data.memoryMb)} MB • ${data.node}`, true],
        ].map(([k, v, ok]) => (
          <div key={String(k)} className="card px-4 py-3">
            <div className="text-xs text-muted">{k}</div>
            <div className={`mt-1 flex items-center gap-2 text-sm font-bold ${ok ? "text-up" : "text-down"}`}><span className="inline-block size-2 animate-pulse-dot rounded-full bg-current" />{v}</div>
          </div>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["ارزهای فعال", data.counts.coins], ["سیگنال‌های فعال", data.counts.active], ["در انتظار انتشار", data.counts.pending], ["کل سیگنال‌ها", data.counts.total]].map(([k, v]) => (
          <div key={String(k)} className="card px-4 py-3"><div className="text-xs text-muted">{k}</div><div className="mt-1 text-xl font-extrabold">{fa(Number(v))}</div></div>
        ))}
      </div>
      <Section
        title="موتور تحلیل"
        right={
          <div className="flex items-center gap-2">
            <Msg msg={a.msg} />
            <button className="btn btn-brand" disabled={a.busy} onClick={() => a.run(async () => {
              const r = await api<{ busy: boolean; result: { scanned: number; generated: number } | null }>("/api/admin/system", "POST", { action: "scan" });
              await refresh();
              return r.busy ? "اسکن دیگری در حال اجراست" : `اسکن انجام شد: ${fa(r.result?.scanned ?? 0)} تحلیل، ${fa(r.result?.generated ?? 0)} سیگنال جدید`;
            })}>▶ اجرای اسکن دستی</button>
            <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api("/api/admin/system", "POST", { action: "track" }); await refresh(); return "بررسی TP/SL انجام شد ✓"; })}>بررسی TP/SL</button>
          </div>
        }
      >
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div><span className="text-muted">آخرین اسکن: </span>{data.engine.lastScanAt ? timeAgo(data.engine.lastScanAt) : "—"}</div>
          <div><span className="text-muted">آخرین ردیابی TP/SL: </span>{data.engine.lastTrackAt ? `${fa(Math.round((now - data.engine.lastTrackAt) / 1000))} ثانیه پیش` : "—"}</div>
          <div><span className="text-muted">نتیجه اسکن: </span>{data.engine.lastScan ? `${fa(data.engine.lastScan.scanned)} تحلیل در ${fa(data.engine.lastScan.durationMs)}ms` : "—"}</div>
        </div>
        {data.engine.lastScan?.errors.length ? (
          <div className="mt-3 rounded-xl border border-down/30 bg-down/5 p-3 text-xs text-down">
            {data.engine.lastScan.errors.map((e, i) => <div key={i} className="ltr">{e}</div>)}
          </div>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead><tr>{["زمان", "مدت", "تحلیل‌شده", "سیگنال جدید", "خطاها"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className="border-t border-line/50"><td className="td text-xs">{fmtDate(r.startedAt)}</td><td className="td">{fa(r.durationMs)}ms</td><td className="td">{fa(r.scanned)}</td><td className="td">{fa(r.generated)}</td><td className="td">{fa(r.errors?.length ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="سلامت منابع داده">
        <div className="grid gap-3 md:grid-cols-3">
          {data.sources.map((s) => (
            <div key={s.id} className="rounded-xl border border-line bg-panel2/40 p-3 text-sm">
              <div className="flex items-center justify-between font-bold">{SOURCE_NAMES[s.id]}<span className="text-[0.65rem] font-normal text-muted">{s.primary ? "اصلی" : s.enabled ? "پشتیبان" : "غیرفعال"}</span></div>
              <div className="mt-2 space-y-1 text-xs text-muted">
                <div>موفق/ناموفق: <span className="text-up">{fa(s.ok)}</span> / <span className="text-down">{fa(s.fail)}</span></div>
                <div>تأخیر آخر: {s.lastLatencyMs != null ? `${fa(s.lastLatencyMs)}ms` : "—"}</div>
                <div>آخرین موفقیت: {s.lastSuccessAt ? timeAgo(s.lastSuccessAt) : "—"}</div>
                {s.lastError && <div className="ltr text-down">{s.lastError}</div>}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Coins() {
  const { data, loading, refresh } = usePoll<{ items: { id: number; symbol: string; name: string; coingeckoId: string | null; enabled: boolean }[] }>("/api/admin/coins", 0);
  const a = useAction();
  const [f, setF] = useState({ symbol: "", name: "", coingeckoId: "" });
  if (loading && !data) return <Spinner />;
  return (
    <div>
      <Section title="افزودن ارز" sub="نماد باید جفت‌ارز USDT در منابع داده داشته باشد؛ اعتبار آن قبل از ثبت بررسی می‌شود. شناسه CoinGecko برای لوگو و ارزش بازار اختیاری است.">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api("/api/admin/coins", "POST", f); setF({ symbol: "", name: "", coingeckoId: "" }); await refresh(); return "ارز اضافه شد ✓"; }); }}>
          <Field label="نماد"><input required className="ltr w-full uppercase" placeholder="DOGE" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} /></Field>
          <Field label="نام"><input className="w-full" placeholder="Dogecoin" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="شناسه CoinGecko"><input className="ltr w-full" placeholder="dogecoin" value={f.coingeckoId} onChange={(e) => setF({ ...f, coingeckoId: e.target.value })} /></Field>
          <div className="flex items-end gap-3"><button className="btn btn-brand" disabled={a.busy}>افزودن</button><Msg msg={a.msg} /></div>
        </form>
      </Section>
      <Section title={`ارزهای تحت بررسی (${fa(data?.items.length ?? 0)})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead><tr>{["نماد", "نام", "CoinGecko", "فعال", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {data?.items.map((c) => (
                <tr key={c.id} className="border-t border-line/50">
                  <td className="td font-bold">{c.symbol}</td><td className="td">{c.name}</td><td className="td"><span className="ltr text-xs text-muted">{c.coingeckoId ?? "—"}</span></td>
                  <td className="td"><Toggle checked={c.enabled} onChange={(v) => a.run(async () => { await api("/api/admin/coins", "PATCH", { id: c.id, enabled: v }); await refresh(); })} /></td>
                  <td className="td"><button className="btn btn-down !px-2 !py-1 text-xs" onClick={() => { if (confirm(`حذف ${c.symbol}؟`)) a.run(async () => { await api(`/api/admin/coins?id=${c.id}`, "DELETE"); await refresh(); }); }}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Sources({ cfg, save }: CfgCtx) {
  const a = useAction();
  const [res, setRes] = useState<Record<string, string>>({});
  const ids = Object.keys(SOURCE_NAMES) as SourceId[];
  return (
    <Section title="منابع دریافت داده بازار" sub="در صورت قطع منبع اصلی، سیستم به‌صورت خودکار به منابع پشتیبان فعال سوئیچ می‌کند." right={<Msg msg={a.msg} />}>
      <div className="grid gap-3 md:grid-cols-3">
        {ids.map((id) => (
          <div key={id} className={`rounded-xl border p-4 ${cfg.sources.primary === id ? "border-brand/60 bg-brand/5" : "border-line bg-panel2/40"}`}>
            <div className="flex items-center justify-between font-bold">{SOURCE_NAMES[id]}<Toggle checked={cfg.sources.enabled[id]} onChange={(v) => a.run(async () => void (await save("sources", { ...cfg.sources, enabled: { ...cfg.sources.enabled, [id]: v } })))} /></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn !py-1 text-xs" disabled={cfg.sources.primary === id || !cfg.sources.enabled[id] || a.busy} onClick={() => a.run(async () => void (await save("sources", { ...cfg.sources, primary: id })))}>{cfg.sources.primary === id ? "✓ منبع اصلی" : "انتخاب به‌عنوان اصلی"}</button>
              <button className="btn !py-1 text-xs" onClick={async () => {
                setRes((r) => ({ ...r, [id]: "…" }));
                try { const r = await api<{ latencyMs: number; matched: boolean }>("/api/admin/system", "POST", { action: "source_test", source: id }); setRes((x) => ({ ...x, [id]: r.matched ? `✓ ${r.latencyMs}ms` : "پاسخ از منبع جایگزین" })); }
                catch (e) { setRes((x) => ({ ...x, [id]: `✗ ${(e as Error).message.slice(0, 60)}` })); }
              }}>تست اتصال</button>
            </div>
            {res[id] && <div className="ltr mt-2 text-xs text-muted">{res[id]}</div>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">همه منابع، API عمومی (بدون کلید) هستند. برای افزودن صرافی جدید، یک Adapter در <span className="ltr">src/lib/market/providers.ts</span> اضافه کنید.</p>
    </Section>
  );
}

export default function AdminApp() {
  const auth = usePoll<{ authed: boolean; defaultPassword: boolean }>("/api/admin/auth", 0);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [cfg, setCfg] = useState<AdminCfg | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);

  const loadCfg = useCallback(async () => {
    try {
      setCfg(await api<AdminCfg>("/api/admin/config", "GET"));
      setCfgErr(null);
    } catch (e) {
      setCfgErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (auth.data?.authed) loadCfg();
  }, [auth.data?.authed, loadCfg]);

  const coins = usePoll<{ items: { symbol: string; enabled: boolean }[] }>(auth.data?.authed ? "/api/admin/coins" : null, 0);

  if (auth.loading && !auth.data) return <Spinner />;
  if (!auth.data?.authed) return <Login onDone={auth.refresh} />;

  const save: CfgCtx["save"] = async (key, value) => {
    setCfg(await api<AdminCfg>("/api/admin/config", "PUT", { key, value }));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">پنل مدیریت</h1>
          <p className="mt-1 text-sm text-muted">مدیریت ارزها، منابع داده، موتور تحلیل، سیگنال‌ها و اعلان‌ها</p>
        </div>
        <button className="btn" onClick={async () => { await api("/api/admin/auth", "DELETE"); auth.refresh(); }}>خروج</button>
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-brand/20 text-brand" : "text-muted hover:bg-white/5"}`}>{t.label}</button>
        ))}
      </div>
      {cfgErr && <ErrorBox message={cfgErr} onRetry={loadCfg} />}
      {tab === "overview" && <Overview defaultPassword={auth.data.defaultPassword} />}
      {tab === "coins" && <Coins />}
      {tab === "signals" && <AdminSignals coins={coins.data?.items.map((c) => c.symbol) ?? []} />}
      {!cfg && !cfgErr && ["sources", "engine", "api"].includes(tab) && <Spinner />}
      {cfg && tab === "sources" && <Sources cfg={cfg} save={save} />}
      {cfg && tab === "engine" && <AdminEngine cfg={cfg} save={save} />}
      {cfg && tab === "api" && <AdminApi cfg={cfg} save={save} />}
    </div>
  );
}
