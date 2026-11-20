import type { AnalysisResult } from "@/lib/analysis/engine";
import { getConfig } from "@/lib/config";
import { fmtPrice } from "@/lib/format";

export type AiReply = { engine: "llm" | "local"; model: string | null; text: string; note?: string };

function describe(a: AnalysisResult): string {
  const i = a.indicators;
  const lines: string[] = [];
  const dirFa = a.direction === "BUY" ? "صعودی (خرید)" : a.direction === "SELL" ? "نزولی (فروش)" : "خنثی";
  lines.push(`📊 جمع‌بندی ${a.symbol}/USDT در تایم‌فریم ${a.timeframe}: سوگیری ${dirFa} با امتیاز اطمینان ${a.confidence}٪ (قیمت ${fmtPrice(a.price)}).`);
  const bulls = a.modules.filter((m) => m.score >= 0.3).sort((x, y) => y.score * y.weight - x.score * x.weight);
  const bears = a.modules.filter((m) => m.score <= -0.3).sort((x, y) => x.score * x.weight - y.score * y.weight);
  if (bulls.length) lines.push(`🟢 عوامل صعودی: ${bulls.slice(0, 4).map((m) => `${m.name} (${m.reason})`).join("؛ ")}.`);
  if (bears.length) lines.push(`🔴 عوامل نزولی: ${bears.slice(0, 4).map((m) => `${m.name} (${m.reason})`).join("؛ ")}.`);
  if (!bulls.length && !bears.length) lines.push("⚪ هیچ ماژولی سیگنال قوی نمی‌دهد؛ بازار در حالت انتظار است.");
  if (Number.isFinite(i.rsi)) {
    const rs = i.rsi > 70 ? "اشباع خرید؛ احتمال اصلاح" : i.rsi < 30 ? "اشباع فروش؛ احتمال بازگشت" : i.rsi > 55 ? "مومنتوم مثبت" : i.rsi < 45 ? "مومنتوم منفی" : "خنثی";
    lines.push(`📈 اندیکاتورها: RSI=${i.rsi.toFixed(1)} (${rs})، هیستوگرام MACD ${i.macdHist >= 0 ? "مثبت" : "منفی"}، ${i.ema9 > i.ema21 && i.ema21 > i.ema50 ? "EMAها صعودی" : i.ema9 < i.ema21 && i.ema21 < i.ema50 ? "EMAها نزولی" : "EMAها در هم تنیده"}، نوسان ATR≈${i.atrPct.toFixed(2)}٪ قیمت.`);
  }
  lines.push(`🧱 سطوح کلیدی: حمایت ${a.supports.length ? a.supports.map(fmtPrice).join(" / ") : "نامشخص"} | مقاومت ${a.resistances.length ? a.resistances.map(fmtPrice).join(" / ") : "نامشخص"}.`);
  if (a.plan && !a.rejected) {
    lines.push(`🎯 طرح معامله: ورود ${fmtPrice(a.plan.entry)}، حد ضرر ${fmtPrice(a.plan.stopLoss)}، اهداف ${a.plan.tp.map(fmtPrice).join(" / ")} (R/R≈${a.plan.riskReward.toFixed(2)}).`);
  } else if (a.rejected) {
    lines.push(`⛔ موتور برای این ستاپ سیگنال صادر نمی‌کند: ${a.rejected}.`);
  }
  const risk: string[] = [];
  if (a.indicators.atrPct > 3) risk.push("نوسان بالاست؛ حجم پوزیشن را کاهش دهید");
  if (a.confidence < 60) risk.push("اطمینان زیر ۶۰٪ است؛ منتظر تأیید بمانید");
  risk.push("حد ضرر را رعایت کنید و بیش از ۱–۲٪ سرمایه را ریسک نکنید");
  lines.push(`⚠️ مدیریت ریسک: ${risk.join("؛ ")}. این تحلیل توصیه مالی نیست.`);
  return lines.join("\n\n");
}

export async function aiAssist(a: AnalysisResult, question?: string): Promise<AiReply> {
  const local = describe(a);
  const { integrations } = await getConfig();
  const key = integrations.aiKey || process.env.OPENAI_API_KEY || "";
  if (!key) {
    return {
      engine: "local",
      model: null,
      text: question ? `${local}\n\nℹ️ پاسخ به پرسش شما نیازمند اتصال مدل زبانی است؛ کلید API را در پنل مدیریت > تنظیمات API وارد کنید.` : local,
      note: "تحلیل توسط موتور خبره داخلی تولید شد (کلید مدل زبانی تنظیم نشده است).",
    };
  }
  const context = {
    symbol: a.symbol,
    timeframe: a.timeframe,
    price: a.price,
    direction: a.direction,
    confidence: a.confidence,
    indicators: a.indicators,
    supports: a.supports,
    resistances: a.resistances,
    plan: a.plan,
    rejected: a.rejected,
    modules: a.modules.map((m) => ({ name: m.name, score: m.score, reason: m.reason })),
  };
  const base = (integrations.aiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = integrations.aiModel || "gpt-4o-mini";
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "تو دستیار تحلیل تکنیکال پلتفرم Meme Radar Pro هستی. فقط به فارسی و مختصر پاسخ بده. فقط از داده‌های ارائه‌شده استفاده کن، قیمت یا سیگنال جدید نساز، سود تضمین نکن و همیشه نکات مدیریت ریسک را یادآوری کن.",
          },
          {
            role: "user",
            content: `داده‌های خروجی موتور تحلیل (JSON):\n${JSON.stringify(context)}\n\n${question ? `پرسش کاربر: ${question}` : "یک تحلیل خلاصه و ساختاریافته از این وضعیت بنویس: روند، تأییدها و تناقض‌ها، سطوح کلیدی، سناریوی ابطال و ریسک."}`,
          },
        ],
      }),
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("پاسخ خالی");
    return { engine: "llm", model, text };
  } catch (e) {
    return { engine: "local", model: null, text: local, note: `اتصال به مدل زبانی ناموفق بود (${(e as Error).message}); تحلیل داخلی نمایش داده شد.` };
  }
}
