import { STATUS_LABEL } from "@/lib/types";
import { parseFilters, querySignals } from "@/lib/signalQuery";

export const dynamic = "force-dynamic";

const HEAD = ["شناسه", "ارز", "جهت", "تایم‌فریم", "قیمت ورود", "حد ضرر", "TP1", "TP2", "TP3", "قدرت (%)", "ریسک/ریوارد", "وضعیت", "تعداد TP لمس‌شده", "قیمت خروج", "سود/زیان نهایی (%)", "زمان صدور", "زمان بسته شدن", "منبع", "دلیل تحلیل"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const f = parseFilters(url.searchParams);
  f.limit = 5000;
  f.offset = 0;
  const format = url.searchParams.get("format") === "xls" ? "xls" : "csv";
  const { items } = await querySignals(f);
  const rows = items.map((s) => [
    s.id,
    `${s.symbol}/USDT`,
    s.direction,
    s.timeframe,
    s.entry,
    s.stopLoss,
    s.tp1,
    s.tp2,
    s.tp3,
    s.confidence,
    s.riskReward,
    STATUS_LABEL[s.status],
    s.tpHit,
    s.closePrice ?? "",
    s.pnlPct === null ? "" : Number(s.pnlPct.toFixed(3)),
    s.createdAt,
    s.closedAt ?? "",
    s.source === "manual" ? "دستی" : "موتور تحلیل",
    s.reason,
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const body = "\uFEFF" + [HEAD, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    return new Response(body, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="meme-radar-signals-${stamp}.csv"` },
    });
  }
  const h = (v: unknown) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Signals</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body dir="rtl"><table border="1"><thead><tr>${HEAD.map((x) => `<th>${h(x)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
  return new Response("\uFEFF" + html, {
    headers: { "content-type": "application/vnd.ms-excel; charset=utf-8", "content-disposition": `attachment; filename="meme-radar-signals-${stamp}.xls"` },
  });
}
