import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getConfig } from "@/lib/config";
import type { IntegrationsConfig } from "@/lib/types";

export type NotifyType = "new" | "tp" | "sl" | "close" | "system";

export async function sendTelegram(text: string, cfg: Pick<IntegrationsConfig, "telegramToken" | "telegramChatId">) {
  if (!cfg.telegramToken || !cfg.telegramChatId) throw new Error("توکن یا شناسه چت تلگرام تنظیم نشده است");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.telegramChatId, text, disable_web_page_preview: true }),
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!r.ok || !j.ok) throw new Error(j.description ?? `Telegram HTTP ${r.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function notify(n: { type: NotifyType; title: string; body: string; signalId?: number }) {
  await db.insert(notifications).values({ type: n.type, title: n.title, body: n.body, signalId: n.signalId ?? null });
  try {
    const { integrations: i } = await getConfig();
    const allowed =
      n.type === "system" ? false : n.type === "new" ? i.notifyNew : n.type === "tp" ? i.notifyTp : n.type === "sl" ? i.notifySl : i.notifyClose;
    if (i.telegramEnabled && allowed) await sendTelegram(`${n.title}\n${n.body}\n\n— Meme Radar Pro`, i);
  } catch (e) {
    console.error("[telegram]", (e as Error).message);
  }
}
