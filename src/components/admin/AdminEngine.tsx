"use client";
import { useState } from "react";
import { TIMEFRAMES, type EngineConfig, type ModulesConfig } from "@/lib/types";
import { Toggle } from "../ui";
import { Field, Msg, Section, useAction, type CfgCtx } from "./AdminUi";

export default function AdminEngine({ cfg, save }: CfgCtx) {
  const [eng, setEng] = useState<EngineConfig>(cfg.engine);
  const [mods, setMods] = useState<ModulesConfig>(cfg.modules);
  const a1 = useAction();
  const a2 = useAction();
  const num = (k: keyof EngineConfig) => (
    <input type="number" className="w-full" value={eng[k] as number} onChange={(e) => setEng({ ...eng, [k]: Number(e.target.value) })} />
  );
  return (
    <div>
      <Section
        title="تنظیمات صدور سیگنال"
        sub="حداقل قدرت لازم، تایم‌فریم‌ها و مدیریت چرخه عمر سیگنال"
        right={
          <div className="flex items-center gap-3">
            <Msg msg={a1.msg} />
            <button className="btn btn-brand" disabled={a1.busy} onClick={() => a1.run(async () => void (await save("engine", eng)))}>ذخیره تنظیمات</button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-6">
          <Toggle checked={eng.engineEnabled} onChange={(v) => setEng({ ...eng, engineEnabled: v })} label="موتور تحلیل فعال" />
          <Toggle checked={eng.autoPublish} onChange={(v) => setEng({ ...eng, autoPublish: v })} label="انتشار خودکار سیگنال‌ها (غیرفعال = نیازمند تأیید مدیر)" />
        </div>
        <div className="mb-4">
          <div className="mb-2 text-xs text-muted">تایم‌فریم‌های تحت اسکن</div>
          <div className="flex flex-wrap gap-2">
            {TIMEFRAMES.map((t) => {
              const on = eng.timeframes.includes(t);
              return (
                <button key={t} className={`btn ${on ? "!border-brand/60 !bg-brand/15 !text-brand" : ""}`} onClick={() => setEng({ ...eng, timeframes: on ? eng.timeframes.filter((x) => x !== t) : [...eng.timeframes, t] })}>
                  {on ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="حداقل قدرت سیگنال (٪)" hint="سیگنال‌های زیر این مقدار صادر نمی‌شوند">{num("minConfidence")}</Field>
          <Field label="فاصله اسکن (ثانیه)">{num("scanIntervalSec")}</Field>
          <Field label="انقضای سیگنال (تعداد کندل)">{num("expiryCandles")}</Field>
          <Field label="فاصله بین دو سیگنال (کندل)" hint="جلوگیری از تکرار سیگنال روی یک ارز/تایم‌فریم">{num("cooldownCandles")}</Field>
          <Field label="ضریب ATR برای حد ضرر">{num("atrMultiplier")}</Field>
          <Field label="حداکثر حد ضرر (٪ قیمت)">{num("maxSlPct")}</Field>
          <Field label="حداقل ریسک به ریوارد">{num("minRR")}</Field>
          <Field label="حجم فرضی هر معامله ($)" hint="برای محاسبه سود/زیان دلاری">{num("positionSizeUsd")}</Field>
        </div>
      </Section>

      <Section
        title="ماژول‌های تحلیلی و اندیکاتورها"
        sub="هر ماژول امتیازی بین ۱- تا ۱+ تولید می‌کند؛ قدرت نهایی از میانگین وزنی ماژول‌های فعال و میزان هم‌سویی آن‌ها محاسبه می‌شود."
        right={
          <div className="flex items-center gap-3">
            <Msg msg={a2.msg} />
            <button className="btn btn-brand" disabled={a2.busy} onClick={() => a2.run(async () => void (await save("modules", mods)))}>ذخیره ماژول‌ها</button>
          </div>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {cfg.moduleDefs.map((d) => {
            const m = mods[d.id];
            return (
              <div key={d.id} className={`rounded-xl border p-3 transition ${m.enabled ? "border-line bg-panel2/50" : "border-line/50 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-[0.7rem] text-muted">{d.description}</div>
                  </div>
                  <Toggle checked={m.enabled} onChange={(v) => setMods({ ...mods, [d.id]: { ...m, enabled: v } })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="وزن">
                    <input type="number" step="0.1" className="w-full" value={m.weight} onChange={(e) => setMods({ ...mods, [d.id]: { ...m, weight: Number(e.target.value) } })} />
                  </Field>
                  {Object.entries(d.paramLabels).map(([pk, label]) => (
                    <Field key={pk} label={label}>
                      <input type="number" step="any" className="w-full" value={m.params[pk]} onChange={(e) => setMods({ ...mods, [d.id]: { ...m, params: { ...m.params, [pk]: Number(e.target.value) } } })} />
                    </Field>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">افزودن اندیکاتور جدید: یک ماژول با امضای <span className="ltr">run(ctx, params)</span> در <span className="ltr">src/lib/analysis/modules.ts</span> به آرایه <span className="ltr">MODULES</span> اضافه کنید؛ به‌صورت خودکار در این پنل، موتور و نمودار ظاهر می‌شود.</p>
      </Section>
    </div>
  );
}
