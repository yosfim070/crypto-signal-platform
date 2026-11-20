"use client";
import { useState } from "react";
import { api } from "@/lib/hooks";
import type { IntegrationsConfig } from "@/lib/types";
import { Toggle } from "../ui";
import { Field, Msg, Section, useAction, type CfgCtx } from "./AdminUi";

export default function AdminApi({ cfg, save }: CfgCtx) {
  const [i, setI] = useState<IntegrationsConfig>(cfg.integrations);
  const a = useAction();
  const t = useAction();
  const set = <K extends keyof IntegrationsConfig>(k: K, v: IntegrationsConfig[K]) => setI({ ...i, [k]: v });
  return (
    <div>
      <Section
        title="ربات تلگرام"
        sub="اعلان‌های سیگنال جدید، TP، SL و بسته‌شدن معامله به چت/کانال شما ارسال می‌شود. توکن به‌صورت امن در سرور ذخیره می‌شود و هرگز به مرورگر بازگردانده نمی‌شود."
        right={
          <div className="flex items-center gap-3">
            <Msg msg={a.msg} />
            <button className="btn btn-brand" disabled={a.busy} onClick={() => a.run(async () => void (await save("integrations", i)))}>ذخیره تنظیمات API</button>
          </div>
        }
      >
        <div className="mb-4"><Toggle checked={i.telegramEnabled} onChange={(v) => set("telegramEnabled", v)} label="ارسال اعلان به تلگرام فعال باشد" /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="توکن ربات (از BotFather)"><input className="ltr w-full" type="password" autoComplete="off" value={i.telegramToken} onChange={(e) => set("telegramToken", e.target.value)} placeholder="123456:ABC…" /></Field>
          <Field label="شناسه چت / کانال (Chat ID)"><input className="ltr w-full" value={i.telegramChatId} onChange={(e) => set("telegramChatId", e.target.value)} placeholder="-100123456789" /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <Toggle checked={i.notifyNew} onChange={(v) => set("notifyNew", v)} label="سیگنال جدید" />
          <Toggle checked={i.notifyTp} onChange={(v) => set("notifyTp", v)} label="رسیدن به TP" />
          <Toggle checked={i.notifySl} onChange={(v) => set("notifySl", v)} label="برخورد به SL" />
          <Toggle checked={i.notifyClose} onChange={(v) => set("notifyClose", v)} label="بسته‌شدن معامله" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn" disabled={t.busy} onClick={() => t.run(async () => { await save("integrations", i); await api("/api/admin/system", "POST", { action: "telegram_test" }); return "پیام آزمایشی ارسال شد ✓"; })}>ارسال پیام آزمایشی</button>
          <Msg msg={t.msg} />
        </div>
      </Section>

      <Section title="دستیار هوش مصنوعی (LLM)" sub="اختیاری: با اتصال به هر سرویس سازگار با OpenAI، دکمه «تحلیل AI» پاسخ مدل زبانی را روی خروجی واقعی اندیکاتورها نمایش می‌دهد. بدون کلید، موتور خبره داخلی توضیح می‌دهد.">
        {cfg.aiEnvKey && <p className="mb-3 text-xs text-up">کلید از متغیر محیطی OPENAI_API_KEY خوانده می‌شود.</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="آدرس پایه API"><input className="ltr w-full" value={i.aiBaseUrl} onChange={(e) => set("aiBaseUrl", e.target.value)} /></Field>
          <Field label="نام مدل"><input className="ltr w-full" value={i.aiModel} onChange={(e) => set("aiModel", e.target.value)} /></Field>
          <Field label="کلید API"><input className="ltr w-full" type="password" autoComplete="off" value={i.aiKey} onChange={(e) => set("aiKey", e.target.value)} placeholder="sk-…" /></Field>
        </div>
      </Section>

      <Section title="امنیت ورود مدیر" sub="رمز مدیر از متغیر محیطی ADMIN_PASSWORD خوانده می‌شود و نشست با کوکی HttpOnly امضاشده (۱۲ ساعت) مدیریت می‌شود. برای تغییر رمز، مقدار ADMIN_PASSWORD (و در صورت نیاز ADMIN_SESSION_SECRET) را در تنظیمات محیط سرور قرار دهید.">
        <p className="text-xs text-muted">کلیدهای API فقط سمت سرور نگهداری می‌شوند و در پاسخ‌های API به‌صورت ماسک‌شده نمایش داده می‌شوند.</p>
      </Section>
    </div>
  );
}
