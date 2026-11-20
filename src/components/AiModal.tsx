"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/hooks";

type Reply = { engine: "llm" | "local"; model: string | null; text: string; note?: string };

export default function AiModal({ symbol, timeframe, onClose }: { symbol: string; timeframe: string; onClose: () => void }) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<{ q: string; a: Reply }[]>([]);
  const ran = useRef(false);

  const ask = async (question?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Reply>("/api/ai", "POST", { symbol, timeframe, question });
      if (question) setHistory((h) => [...h, { q: question, a: r }]);
      else setReply(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="card flex max-h-[90vh] w-full max-w-2xl animate-fade-in flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-lg">🤖</span> دستیار هوش مصنوعی — {symbol}/USDT <span className="ltr text-xs text-muted">({timeframe})</span>
          </div>
          <button className="btn !px-2.5 !py-1" onClick={onClose} aria-label="بستن">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm leading-7">
          {busy && !reply && (
            <div className="flex items-center gap-3 py-8 text-muted">
              <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" /> در حال تحلیل داده‌های زنده بازار…
            </div>
          )}
          {error && <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-down">⚠️ {error}</div>}
          {reply && (
            <div>
              <div className="mb-2 flex flex-wrap gap-2 text-[0.7rem]">
                <span className={`rounded-md border px-2 py-0.5 ${reply.engine === "llm" ? "border-brand/40 text-brand" : "border-line text-muted"}`}>
                  {reply.engine === "llm" ? `مدل زبانی: ${reply.model}` : "موتور خبره داخلی"}
                </span>
              </div>
              <div className="whitespace-pre-line">{reply.text}</div>
              {reply.note && <div className="mt-2 text-xs text-warn">{reply.note}</div>}
            </div>
          )}
          {history.map((h, i) => (
            <div key={i} className="space-y-2 border-t border-line pt-3">
              <div className="rounded-xl bg-brand/10 px-3 py-2 text-brand">🙋 {h.q}</div>
              <div className="whitespace-pre-line">{h.a.text}</div>
              {h.a.note && <div className="text-xs text-warn">{h.a.note}</div>}
            </div>
          ))}
          {busy && reply && <div className="text-xs text-muted">در حال دریافت پاسخ…</div>}
        </div>
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim() && !busy) {
              ask(q.trim());
              setQ("");
            }
          }}
        >
          <input className="flex-1" placeholder="سؤال بپرسید: مثلاً «سناریوی ابطال این ستاپ چیست؟»" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} />
          <button className="btn btn-brand" disabled={busy || !q.trim()}>ارسال</button>
        </form>
      </div>
    </div>
  );
}
