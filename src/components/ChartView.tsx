"use client";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ema } from "@/lib/analysis/indicators";
import { usePoll } from "@/lib/hooks";
import { fa, fmtPrice } from "@/lib/format";
import { TF_MS, TIMEFRAMES, type Candle, type SignalDTO, type Timeframe } from "@/lib/types";
import AiModal from "./AiModal";
import { DirBadge, ErrorBox, Spinner, Strength, Toggle } from "./ui";

type Analysis = {
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  price: number;
  supports: number[];
  resistances: number[];
  indicators: { rsi: number; macdHist: number; ema9: number; ema21: number; ema50: number; atrPct: number };
  modules: { id: string; name: string; score: number; weight: number; reason: string }[];
  plan: { entry: number; stopLoss: number; tp: number[]; riskReward: number } | null;
  rejected: string | null;
  reason: string;
};
type Resp = { candles: Candle[]; source: string; requestedSource: string | null; signals: SignalDTO[]; analysis: Analysis };

const TV_INTERVAL: Record<Timeframe, string> = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" };
const TV_EXCHANGE: Record<string, string> = { binance: "BINANCE", okx: "OKX", kucoin: "KUCOIN" };
const tzShift = new Date().getTimezoneOffset() * 60;
const toT = (ms: number) => (Math.floor(ms / 1000) - tzShift) as UTCTimestamp;

export default function ChartView() {
  const sp = useSearchParams();
  const [symbol, setSymbol] = useState((sp.get("symbol") ?? "DOGE").toUpperCase());
  const initTf = sp.get("tf") as Timeframe;
  const [tf, setTf] = useState<Timeframe>(TIMEFRAMES.includes(initTf) ? initTf : "15m");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<"internal" | "tradingview">("internal");
  const [showEma, setShowEma] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [ai, setAi] = useState(false);

  const coins = usePoll<{ coins: { symbol: string; name: string }[] }>("/api/dashboard", 0);
  const url = mode === "internal" ? `/api/candles?symbol=${symbol}&tf=${tf}${source ? `&source=${source}` : ""}` : null;
  const { data, error, loading, refresh } = usePoll<Resp>(url, 5000, true);

  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const fittedKey = useRef("");

  // create chart once (when internal mode mounts)
  useEffect(() => {
    if (mode !== "internal" || !boxRef.current) return;
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8794ab", fontFamily: "Vazirmatn Variable, sans-serif" },
      grid: { vertLines: { color: "#161e2d" }, horzLines: { color: "#161e2d" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#212b3d" },
      timeScale: { borderColor: "#212b3d", timeVisible: true, secondsVisible: false },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: "#16c784", downColor: "#ea3943", borderVisible: false, wickUpColor: "#16c784", wickDownColor: "#ea3943" });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    ema21Ref.current = chart.addSeries(LineSeries, { color: "#4f8cff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: "#f5a524", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    markersRef.current = createSeriesMarkers(candle, []);
    fittedKey.current = "";
    return () => {
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = markersRef.current = null;
      linesRef.current = [];
    };
  }, [mode]);

  const key = `${symbol}|${tf}|${source}`;
  const candles = data?.candles;
  const closes = useMemo(() => candles?.map((c) => c.c) ?? [], [candles]);

  // feed data
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle || !data || !candles?.length) return;
    const last = candles[candles.length - 1].c;
    const precision = last >= 1 ? 4 : last >= 0.01 ? 6 : last >= 0.0001 ? 8 : 10;
    candle.applyOptions({ priceFormat: { type: "price", precision, minMove: Number(`1e-${precision}`) } });
    candle.setData(candles.map((c) => ({ time: toT(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
    volRef.current?.setData(candles.map((c) => ({ time: toT(c.t), value: c.v, color: c.c >= c.o ? "#16c78440" : "#ea394340" })));

    const e21 = ema(closes, 21);
    const e50 = ema(closes, 50);
    ema21Ref.current?.setData(showEma ? candles.flatMap((c, i) => (Number.isFinite(e21[i]) ? [{ time: toT(c.t), value: e21[i] }] : [])) : []);
    ema50Ref.current?.setData(showEma ? candles.flatMap((c, i) => (Number.isFinite(e50[i]) ? [{ time: toT(c.t), value: e50[i] }] : [])) : []);

    // price lines
    linesRef.current.forEach((l) => candle.removePriceLine(l));
    linesRef.current = [];
    const addLine = (price: number, color: string, title: string, style: LineStyle = LineStyle.Dashed) =>
      linesRef.current.push(candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    if (showTrades)
      for (const s of data.signals.filter((x) => x.status === "active")) {
        addLine(s.entry, "#9fb0cc", `Entry ${s.direction}`);
        addLine(s.currentSl, "#ea3943", "SL");
        addLine(s.tp1, "#16c784", "TP1");
        addLine(s.tp2, "#16c784", "TP2");
        addLine(s.tp3, "#16c784", "TP3");
      }
    if (showLevels) {
      data.analysis.supports.forEach((p, i) => addLine(p, "#16c78499", `حمایت ${fa(i + 1)}`, LineStyle.Dotted));
      data.analysis.resistances.forEach((p, i) => addLine(p, "#ea394399", `مقاومت ${fa(i + 1)}`, LineStyle.Dotted));
    }

    // markers (entries/exits)
    const snap = (ms: number) => {
      let found: Candle | null = null;
      for (const c of candles) if (c.t <= ms) found = c;
      return found && ms < found.t + TF_MS[tf] * 1.5 ? found : null;
    };
    const mk: SeriesMarker<Time>[] = [];
    if (showTrades)
      for (const s of data.signals) {
        const ec = snap(new Date(s.createdAt).getTime());
        if (ec)
          mk.push({
            time: toT(ec.t),
            position: s.direction === "BUY" ? "belowBar" : "aboveBar",
            shape: s.direction === "BUY" ? "arrowUp" : "arrowDown",
            color: s.direction === "BUY" ? "#16c784" : "#ea3943",
            text: `${s.direction} ${s.confidence}`,
          });
        if (s.closedAt && s.status !== "pending") {
          const xc = snap(new Date(s.closedAt).getTime());
          if (xc)
            mk.push({
              time: toT(xc.t),
              position: s.direction === "BUY" ? "aboveBar" : "belowBar",
              shape: "circle",
              color: s.status === "success" ? "#16c784" : s.status === "failed" ? "#ea3943" : "#f5a524",
              text: s.status === "success" ? "خروج ✓" : s.status === "failed" ? "SL" : "خروج",
            });
        }
      }
    mk.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current?.setMarkers(mk);

    if (fittedKey.current !== key) {
      chartRef.current?.timeScale().fitContent();
      fittedKey.current = key;
    }
  }, [data, candles, closes, showEma, showLevels, showTrades, tf, key]);

  const a = data?.analysis;
  const exch = TV_EXCHANGE[data?.source ?? source ?? "binance"] ?? "BINANCE";
  const tvSrc = `https://s.tradingview.com/widgetembed/?symbol=${exch}%3A${symbol}USDT&interval=${TV_INTERVAL[tf]}&theme=dark&style=1&locale=en&timezone=exchange&hide_side_toolbar=0&allow_symbol_change=0&withdateranges=1&studies=RSI%40tv-basicstudies%1FMACD%40tv-basicstudies`;
  const live = candles?.[candles.length - 1];
  const prev = candles?.[candles.length - 2];
  const chg = live && prev ? ((live.c - prev.c) / prev.c) * 100 : null;

  return (
    <div>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="انتخاب ارز" className="font-bold">
          {(coins.data?.coins ?? [{ symbol, name: symbol }]).map((c) => (
            <option key={c.symbol} value={c.symbol}>{c.symbol}/USDT — {c.name}</option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-xl border border-line">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => setTf(t)} className={`px-3 py-2 text-xs font-bold ${tf === t ? "bg-brand/20 text-brand" : "text-muted hover:bg-white/5"}`}>{t}</button>
          ))}
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="منبع داده" disabled={mode !== "internal"}>
          <option value="">منبع: خودکار (اصلی)</option>
          <option value="binance">Binance</option>
          <option value="okx">OKX</option>
          <option value="kucoin">KuCoin</option>
        </select>
        <div className="flex overflow-hidden rounded-xl border border-line">
          <button onClick={() => setMode("internal")} className={`px-3 py-2 text-xs font-bold ${mode === "internal" ? "bg-brand/20 text-brand" : "text-muted"}`}>نمودار داخلی</button>
          <button onClick={() => setMode("tradingview")} className={`px-3 py-2 text-xs font-bold ${mode === "tradingview" ? "bg-brand/20 text-brand" : "text-muted"}`}>TradingView</button>
        </div>
        {mode === "internal" && (
          <div className="mr-auto flex flex-wrap items-center gap-4 text-xs">
            <Toggle checked={showEma} onChange={setShowEma} label="EMA 21/50" />
            <Toggle checked={showLevels} onChange={setShowLevels} label="حمایت/مقاومت" />
            <Toggle checked={showTrades} onChange={setShowTrades} label="ورود/خروج و SL/TP" />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-extrabold">{symbol}/USDT</span>
              <span className="ltr text-xs text-muted">{tf}</span>
              {live && <span className="ltr font-bold">{fmtPrice(live.c)}</span>}
              {chg !== null && <span className={`ltr text-xs font-semibold ${chg >= 0 ? "text-up" : "text-down"}`}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>}
            </div>
            {mode === "internal" && data && (
              <span className="flex items-center gap-1.5 text-xs text-up">
                <span className="inline-block size-2 animate-pulse-dot rounded-full bg-current" /> {data.source.toUpperCase()}
                {data.requestedSource && data.requestedSource !== data.source && <span className="text-warn">(منبع انتخابی در دسترس نبود)</span>}
              </span>
            )}
          </div>
          {mode === "internal" ? (
            <div className="relative h-[460px] sm:h-[560px]">
              <div ref={boxRef} className="absolute inset-0" dir="ltr" />
              {loading && !data && <div className="absolute inset-0 grid place-items-center bg-bg/60"><Spinner label="دریافت کندل‌های زنده…" /></div>}
              {error && !data && <div className="absolute inset-0 grid place-items-center p-6"><ErrorBox message={error} onRetry={refresh} /></div>}
            </div>
          ) : (
            <iframe key={tvSrc} src={tvSrc} title="TradingView" className="h-[520px] w-full sm:h-[620px]" allowFullScreen />
          )}
          {error && data && <div className="border-t border-line px-4 py-2 text-xs text-warn">⚠️ بروزرسانی آخر ناموفق بود ({error}); آخرین داده معتبر نمایش داده می‌شود.</div>}
        </div>

        <aside className="space-y-3">
          {mode === "tradingview" && <div className="card p-4 text-xs text-muted">در حالت TradingView ابزارهای ویجت خود TradingView فعال است. برای مشاهده ورود/خروج و خطوط SL/TP موتور، به «نمودار داخلی» برگردید.</div>}
          {loading && !data && mode === "internal" && <Spinner />}
          {a && mode === "internal" && (
            <>
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted">تحلیل لحظه‌ای موتور ({tf})</div>
                    <div className="mt-1.5"><DirBadge dir={a.direction} /></div>
                  </div>
                  <Strength value={a.confidence} dir={a.direction} size={56} />
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">{a.reason}</p>
                {a.plan && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-panel2 p-3 text-xs">
                    <span className="text-muted">ورود</span><span className="ltr font-semibold">{fmtPrice(a.plan.entry)}</span>
                    <span className="text-muted">حد ضرر</span><span className="ltr font-semibold text-down">{fmtPrice(a.plan.stopLoss)}</span>
                    {a.plan.tp.map((t, i) => (<span key={i} className="contents"><span className="text-muted">TP{i + 1}</span><span className="ltr font-semibold text-up">{fmtPrice(t)}</span></span>))}
                    <span className="text-muted">R/R</span><span className="ltr font-semibold">1:{a.plan.riskReward.toFixed(2)}</span>
                  </div>
                )}
                {a.rejected && a.direction !== "NEUTRAL" && <p className="mt-2 text-xs text-warn">⛔ {a.rejected}</p>}
                <p className="mt-2 text-[0.65rem] text-muted">این تحلیل لحظه‌ای است و سیگنال رسمی محسوب نمی‌شود؛ سیگنال‌ها فقط با عبور از حداقل قدرت صادر می‌شوند.</p>
                <button className="btn btn-brand mt-3 w-full" onClick={() => setAi(true)}>🤖 تحلیل با هوش مصنوعی</button>
              </div>
              <div className="card p-4">
                <div className="mb-2 text-sm font-bold">اندیکاتورها</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-muted">RSI(14)</span><span className="ltr font-semibold">{a.indicators.rsi.toFixed(1)}</span>
                  <span className="text-muted">MACD hist</span><span className={`ltr font-semibold ${a.indicators.macdHist >= 0 ? "text-up" : "text-down"}`}>{a.indicators.macdHist >= 0 ? "▲" : "▼"} {fmtPrice(Math.abs(a.indicators.macdHist))}</span>
                  <span className="text-muted">EMA 9/21/50</span><span className="ltr font-semibold">{a.indicators.ema9 > a.indicators.ema21 && a.indicators.ema21 > a.indicators.ema50 ? "صعودی" : a.indicators.ema9 < a.indicators.ema21 && a.indicators.ema21 < a.indicators.ema50 ? "نزولی" : "مختلط"}</span>
                  <span className="text-muted">نوسان ATR</span><span className="ltr font-semibold">{a.indicators.atrPct.toFixed(2)}%</span>
                </div>
              </div>
              <div className="card p-4">
                <div className="mb-2 text-sm font-bold">امتیاز ماژول‌ها</div>
                <div className="space-y-2">
                  {a.modules.map((m) => (
                    <div key={m.id} title={m.reason}>
                      <div className="flex justify-between text-[0.7rem]"><span>{m.name}</span><span className={`ltr font-semibold ${m.score > 0.1 ? "text-up" : m.score < -0.1 ? "text-down" : "text-muted"}`}>{m.score > 0 ? "+" : ""}{m.score.toFixed(2)}</span></div>
                      <div className="relative mt-1 h-1.5 rounded-full bg-panel2" dir="ltr">
                        <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
                        <span className={`absolute top-0 h-full rounded-full ${m.score >= 0 ? "bg-up" : "bg-down"}`} style={{ left: m.score >= 0 ? "50%" : `${50 + m.score * 50}%`, width: `${Math.abs(m.score) * 50}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {ai && <AiModal symbol={symbol} timeframe={tf} onClose={() => setAi(false)} />}
    </div>
  );
}
