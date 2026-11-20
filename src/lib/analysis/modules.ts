import type { Candle, ModuleOutput } from "@/lib/types";
import { atr, clamp, ema, linreg, macd, rsi, swings } from "./indicators";

export type Ctx = { candles: Candle[]; price: number; atr: number };
type Params = Record<string, number>;

export type ModuleDef = {
  id: string;
  name: string;
  description: string;
  defaultWeight: number;
  defaultParams: Params;
  paramLabels: Record<string, string>;
  run: (ctx: Ctx, p: Params) => ModuleOutput;
};

const n0 = (x: number) => (Number.isFinite(x) ? x : 0);
const fp = (x: number) => (x >= 1 ? x.toFixed(3) : x >= 0.01 ? x.toFixed(5) : x.toPrecision(4));
const none = (reason: string): ModuleOutput => ({ score: 0, reason });

function cluster(points: number[], tol: number) {
  const sorted = [...points].sort((a, b) => a - b);
  const out: { price: number; touches: number }[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(p - last.price) <= tol) {
      last.price = (last.price * last.touches + p) / (last.touches + 1);
      last.touches++;
    } else out.push({ price: p, touches: 1 });
  }
  return out;
}

/* ---------------- Price Action ---------------- */
const priceAction: ModuleDef = {
  id: "priceAction",
  name: "Price Action",
  description: "الگوهای کندلی: انگالفینگ، پین‌بار و مومنتوم بدنه کندل",
  defaultWeight: 1,
  defaultParams: { pinRatio: 2 },
  paramLabels: { pinRatio: "نسبت سایه به بدنه در پین‌بار" },
  run({ candles }, p) {
    const n = candles.length;
    const a = candles[n - 2];
    const b = candles[n - 1];
    const range = b.h - b.l || 1e-12;
    const body = Math.abs(b.c - b.o);
    const up = b.h - Math.max(b.o, b.c);
    const lo = Math.min(b.o, b.c) - b.l;
    if (b.c > b.o && a.c < a.o && b.c >= a.o && b.o <= a.c)
      return { score: 0.8, reason: "الگوی انگالفینگ صعودی در آخرین کندل بسته‌شده" };
    if (b.c < b.o && a.c > a.o && b.c <= a.o && b.o >= a.c)
      return { score: -0.8, reason: "الگوی انگالفینگ نزولی در آخرین کندل بسته‌شده" };
    if (lo > p.pinRatio * body && lo > 0.55 * range && (b.c - b.l) / range > 0.6)
      return { score: 0.7, reason: "پین‌بار صعودی (سایه پایینی بلند و رد قیمت‌های پایین)" };
    if (up > p.pinRatio * body && up > 0.55 * range && (b.h - b.c) / range > 0.6)
      return { score: -0.7, reason: "پین‌بار نزولی (سایه بالایی بلند و رد قیمت‌های بالا)" };
    const strength = ((b.c - b.o) / range) * 0.4;
    return {
      score: clamp(strength),
      reason: strength > 0.1 ? "کندل آخر با بدنه صعودی" : strength < -0.1 ? "کندل آخر با بدنه نزولی" : "کندل آخر بدون الگوی مشخص",
    };
  },
};

/* ---------------- Support & Resistance ---------------- */
const supportResistance: ModuleDef = {
  id: "supportResistance",
  name: "Support & Resistance",
  description: "خوشه‌بندی سوینگ‌های قیمتی و سنجش فاصله از حمایت/مقاومت",
  defaultWeight: 1.2,
  defaultParams: { swingBars: 3, lookback: 150, clusterAtr: 0.6 },
  paramLabels: { swingBars: "تعداد کندل سوینگ", lookback: "بازه بررسی (کندل)", clusterAtr: "ضریب ATR برای ادغام سطوح" },
  run({ candles, price, atr: a }, p) {
    const data = candles.slice(-p.lookback);
    const sw = swings(data, p.swingBars, p.swingBars);
    const tol = a * p.clusterAtr;
    const res = cluster(sw.highs.map((s) => s.price), tol).filter((c) => c.price > price);
    const sup = cluster(sw.lows.map((s) => s.price), tol).filter((c) => c.price < price);
    const supports = sup.sort((x, y) => y.price - x.price).slice(0, 3).map((c) => c.price);
    const resistances = res.sort((x, y) => x.price - y.price).slice(0, 3).map((c) => c.price);
    let score = 0;
    const notes: string[] = [];
    if (supports[0] !== undefined) {
      const d = (price - supports[0]) / a;
      if (d < 1.2) {
        score += (1 - d / 1.2) * 0.9;
        notes.push(`قیمت نزدیک حمایت ${fp(supports[0])}`);
      }
    }
    if (resistances[0] !== undefined) {
      const d = (resistances[0] - price) / a;
      if (d < 1.2) {
        score -= (1 - d / 1.2) * 0.9;
        notes.push(`قیمت نزدیک مقاومت ${fp(resistances[0])}`);
      }
    }
    return {
      score: clamp(score),
      reason: notes.length ? notes.join(" و ") : "قیمت بین حمایت و مقاومت، بدون برخورد به سطح مهم",
      levels: { support: supports, resistance: resistances },
    };
  },
};

/* ---------------- Supply & Demand ---------------- */
const supplyDemand: ModuleDef = {
  id: "supplyDemand",
  name: "Supply & Demand",
  description: "شناسایی نواحی عرضه و تقاضا (Base قبل از حرکت ایمپالسی)",
  defaultWeight: 1,
  defaultParams: { lookback: 120, impulseAtr: 1.6 },
  paramLabels: { lookback: "بازه بررسی (کندل)", impulseAtr: "حداقل بدنه ایمپالس (ضریب ATR)" },
  run({ candles, price, atr: a }, p) {
    const n = candles.length;
    for (let i = n - 2; i > Math.max(2, n - p.lookback); i--) {
      const imp = candles[i];
      const base = candles[i - 1];
      const body = Math.abs(imp.c - imp.o);
      if (body < p.impulseAtr * a || base.h - base.l > 0.9 * a) continue;
      const bullish = imp.c > imp.o;
      const zLow = base.l;
      const zHigh = base.h;
      const later = candles.slice(i + 1);
      const broken = bullish ? later.some((c) => c.c < zLow) : later.some((c) => c.c > zHigh);
      if (broken) continue;
      const inside = price >= zLow - 0.3 * a && price <= zHigh + 0.3 * a;
      if (bullish && inside && price >= zLow)
        return { score: 0.8, reason: `قیمت در ناحیه تقاضا (${fp(zLow)} - ${fp(zHigh)})`, levels: { support: [zHigh] } };
      if (!bullish && inside && price <= zHigh)
        return { score: -0.8, reason: `قیمت در ناحیه عرضه (${fp(zLow)} - ${fp(zHigh)})`, levels: { resistance: [zLow] } };
    }
    return none("قیمت در هیچ ناحیه عرضه/تقاضای معتبری نیست");
  },
};

/* ---------------- Order Blocks ---------------- */
const orderBlocks: ModuleDef = {
  id: "orderBlocks",
  name: "Order Blocks",
  description: "آخرین کندل مخالف پیش از جابه‌جایی قوی؛ بررسی بازگشت قیمت به OB",
  defaultWeight: 1,
  defaultParams: { lookback: 100, displacementAtr: 2 },
  paramLabels: { lookback: "بازه بررسی (کندل)", displacementAtr: "حداقل جابه‌جایی (ضریب ATR)" },
  run({ candles, price, atr: a }, p) {
    const n = candles.length;
    for (let j = n - 5; j > Math.max(1, n - p.lookback); j--) {
      const c = candles[j];
      const fwd = candles.slice(j + 1, j + 4);
      if (fwd.length < 3) continue;
      const rest = candles.slice(j + 4);
      if (c.c < c.o) {
        const top = Math.max(...fwd.map((x) => x.c));
        if (top - c.h > p.displacementAtr * a * 0.5 && top - c.l > p.displacementAtr * a) {
          if (rest.some((x) => x.c < c.l)) continue;
          const touched = candles.slice(-3).some((x) => x.l <= c.h);
          if (price >= c.l && (price <= c.h + 0.3 * a || touched) && price < c.h + a)
            return { score: 0.8, reason: `بازگشت قیمت به اردر بلاک صعودی (${fp(c.l)} - ${fp(c.h)})`, levels: { support: [c.h] } };
        }
      } else if (c.c > c.o) {
        const bot = Math.min(...fwd.map((x) => x.c));
        if (c.l - bot > p.displacementAtr * a * 0.5 && c.h - bot > p.displacementAtr * a) {
          if (rest.some((x) => x.c > c.h)) continue;
          const touched = candles.slice(-3).some((x) => x.h >= c.l);
          if (price <= c.h && (price >= c.l - 0.3 * a || touched) && price > c.l - a)
            return { score: -0.8, reason: `بازگشت قیمت به اردر بلاک نزولی (${fp(c.l)} - ${fp(c.h)})`, levels: { resistance: [c.l] } };
        }
      }
    }
    return none("اردر بلاک فعالی در نزدیکی قیمت وجود ندارد");
  },
};

/* ---------------- Fair Value Gaps ---------------- */
const fairValueGaps: ModuleDef = {
  id: "fvg",
  name: "Fair Value Gaps",
  description: "گپ‌های سه‌کندلی پرنشده و واکنش قیمت به آن‌ها",
  defaultWeight: 0.7,
  defaultParams: { lookback: 60, minGapAtr: 0.3 },
  paramLabels: { lookback: "بازه بررسی (کندل)", minGapAtr: "حداقل اندازه گپ (ضریب ATR)" },
  run({ candles, price, atr: a }, p) {
    const n = candles.length;
    for (let i = n - 1; i > Math.max(2, n - p.lookback); i--) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      const later = candles.slice(i + 1);
      if (c2.l - c0.h > p.minGapAtr * a) {
        if (later.some((x) => x.l <= c0.h)) continue;
        if (price >= c0.h && price <= c2.l)
          return { score: 0.6, reason: `قیمت درون FVG صعودی (${fp(c0.h)} - ${fp(c2.l)})`, levels: { support: [c2.l] } };
        return { score: 0.2, reason: "آخرین FVG پرنشده صعودی است (سوگیری مثبت)" };
      }
      if (c0.l - c2.h > p.minGapAtr * a) {
        if (later.some((x) => x.h >= c0.l)) continue;
        if (price <= c0.l && price >= c2.h)
          return { score: -0.6, reason: `قیمت درون FVG نزولی (${fp(c2.h)} - ${fp(c0.l)})`, levels: { resistance: [c2.h] } };
        return { score: -0.2, reason: "آخرین FVG پرنشده نزولی است (سوگیری منفی)" };
      }
    }
    return none("FVG پرنشده‌ای یافت نشد");
  },
};

/* ---------------- RSI ---------------- */
const rsiModule: ModuleDef = {
  id: "rsi",
  name: "RSI",
  description: "شاخص قدرت نسبی؛ اشباع خرید/فروش و واگرایی ساده",
  defaultWeight: 0.8,
  defaultParams: { period: 14, oversold: 30, overbought: 70 },
  paramLabels: { period: "دوره", oversold: "سطح اشباع فروش", overbought: "سطح اشباع خرید" },
  run({ candles }, p) {
    const closes = candles.map((c) => c.c);
    const r = rsi(closes, p.period);
    const cur = r[r.length - 1];
    if (!Number.isFinite(cur)) return none("داده کافی برای RSI نیست");
    const lowNow = Math.min(...candles.slice(-10).map((c) => c.l));
    const lowPrev = Math.min(...candles.slice(-20, -10).map((c) => c.l));
    const highNow = Math.max(...candles.slice(-10).map((c) => c.h));
    const highPrev = Math.max(...candles.slice(-20, -10).map((c) => c.h));
    const rNow = r.slice(-10);
    const rPrev = r.slice(-20, -10);
    const rLowNow = Math.min(...rNow);
    const rLowPrev = Math.min(...rPrev);
    const rHighNow = Math.max(...rNow);
    const rHighPrev = Math.max(...rPrev);
    if (lowNow < lowPrev && rLowNow > rLowPrev + 2 && cur < 50)
      return { score: 0.7, reason: `واگرایی صعودی RSI (مقدار ${cur.toFixed(1)})` };
    if (highNow > highPrev && rHighNow < rHighPrev - 2 && cur > 50)
      return { score: -0.7, reason: `واگرایی نزولی RSI (مقدار ${cur.toFixed(1)})` };
    if (cur <= p.oversold) return { score: 0.5 + Math.min(0.5, (p.oversold - cur) / 20), reason: `RSI در اشباع فروش (${cur.toFixed(1)})` };
    if (cur >= p.overbought) return { score: -(0.5 + Math.min(0.5, (cur - p.overbought) / 20)), reason: `RSI در اشباع خرید (${cur.toFixed(1)})` };
    return { score: clamp(((50 - cur) / 50) * 0.25), reason: `RSI در محدوده خنثی (${cur.toFixed(1)})` };
  },
};

/* ---------------- MACD ---------------- */
const macdModule: ModuleDef = {
  id: "macd",
  name: "MACD",
  description: "تقاطع خط MACD و سیگنال و شیب هیستوگرام",
  defaultWeight: 1,
  defaultParams: { fast: 12, slow: 26, signal: 9 },
  paramLabels: { fast: "EMA سریع", slow: "EMA کند", signal: "دوره سیگنال" },
  run({ candles }, p) {
    const m = macd(candles.map((c) => c.c), p.fast, p.slow, p.signal);
    const n = m.hist.length;
    const h = m.hist[n - 1];
    const hp = m.hist[n - 2];
    if (!Number.isFinite(h) || !Number.isFinite(hp)) return none("داده کافی برای MACD نیست");
    if (hp <= 0 && h > 0) return { score: 0.9, reason: "تقاطع صعودی MACD با خط سیگنال" };
    if (hp >= 0 && h < 0) return { score: -0.9, reason: "تقاطع نزولی MACD با خط سیگنال" };
    const slope = h > hp ? 0.25 : -0.25;
    const base = h > 0 ? 0.3 : -0.3;
    return {
      score: clamp(base + slope),
      reason: `هیستوگرام ${h > 0 ? "مثبت" : "منفی"} و ${h > hp ? "در حال تقویت" : "در حال تضعیف"}`,
    };
  },
};

/* ---------------- EMA ---------------- */
const emaModule: ModuleDef = {
  id: "ema",
  name: "EMA",
  description: "چیدمان میانگین‌های متحرک نمایی سریع/میانی/کند",
  defaultWeight: 1,
  defaultParams: { fast: 9, mid: 21, slow: 50 },
  paramLabels: { fast: "EMA سریع", mid: "EMA میانی", slow: "EMA کند" },
  run({ candles, price }, p) {
    const closes = candles.map((c) => c.c);
    const f = ema(closes, p.fast);
    const m = ema(closes, p.mid);
    const s = ema(closes, p.slow);
    const i = closes.length - 1;
    if (![f[i], m[i], s[i]].every(Number.isFinite)) return none("داده کافی برای EMA نیست");
    let score = 0;
    let txt = "EMAها در هم تنیده‌اند";
    if (f[i] > m[i] && m[i] > s[i]) {
      score = 0.7;
      txt = `چیدمان صعودی EMA ${p.fast}>${p.mid}>${p.slow}`;
    } else if (f[i] < m[i] && m[i] < s[i]) {
      score = -0.7;
      txt = `چیدمان نزولی EMA ${p.fast}<${p.mid}<${p.slow}`;
    }
    if (price > Math.max(f[i], m[i], s[i])) score += 0.2;
    else if (price < Math.min(f[i], m[i], s[i])) score -= 0.2;
    for (let k = 0; k < 3; k++) {
      const j = i - k;
      if (f[j - 1] <= m[j - 1] && f[j] > m[j]) {
        score += 0.2;
        txt += " + کراس صعودی اخیر";
        break;
      }
      if (f[j - 1] >= m[j - 1] && f[j] < m[j]) {
        score -= 0.2;
        txt += " + کراس نزولی اخیر";
        break;
      }
    }
    return { score: clamp(score), reason: txt };
  },
};

/* ---------------- Volume ---------------- */
const volume: ModuleDef = {
  id: "volume",
  name: "Volume Analysis",
  description: "حجم نسبی نسبت به میانگین و روند OBV",
  defaultWeight: 0.8,
  defaultParams: { period: 20 },
  paramLabels: { period: "دوره میانگین حجم" },
  run({ candles }, p) {
    const n = candles.length;
    const avg = candles.slice(-p.period - 1, -1).reduce((s, c) => s + c.v, 0) / p.period;
    const b = candles[n - 1];
    const rel = avg > 0 ? b.v / avg : 1;
    let obv = 0;
    const obvs: number[] = [];
    for (let i = 1; i < n; i++) {
      obv += candles[i].c > candles[i - 1].c ? candles[i].v : candles[i].c < candles[i - 1].c ? -candles[i].v : 0;
      obvs.push(obv);
    }
    const obvSlope = obvs[obvs.length - 1] - obvs[obvs.length - 11];
    const dir = Math.sign(b.c - b.o);
    let score = dir * clamp((rel - 1) / 2, 0, 1) * 0.9 + Math.sign(obvSlope) * 0.2;
    if (rel < 0.7) score *= 0.4;
    return {
      score: clamp(score),
      reason: `حجم کندل آخر ${rel.toFixed(2)}× میانگین؛ OBV ${obvSlope >= 0 ? "صعودی" : "نزولی"}`,
    };
  },
};

/* ---------------- Market Structure ---------------- */
const marketStructure: ModuleDef = {
  id: "marketStructure",
  name: "Market Structure",
  description: "HH/HL و LH/LL، شکست ساختار (BOS) و تغییر خصلت (CHoCH)",
  defaultWeight: 1.5,
  defaultParams: { swingBars: 3 },
  paramLabels: { swingBars: "تعداد کندل سوینگ" },
  run({ candles, price }, p) {
    const sw = swings(candles.slice(-200), p.swingBars, p.swingBars);
    if (sw.highs.length < 2 || sw.lows.length < 2) return none("سوینگ کافی برای تعیین ساختار وجود ندارد");
    const [h1, h2] = sw.highs.slice(-2);
    const [l1, l2] = sw.lows.slice(-2);
    const hh = h2.price > h1.price;
    const hl = l2.price > l1.price;
    if (hh && hl) {
      return { score: price < l2.price ? -0.6 : 0.8, reason: price < l2.price ? "شکست آخرین HL؛ هشدار تغییر خصلت (CHoCH نزولی)" : "ساختار صعودی (HH و HL)" };
    }
    if (!hh && !hl) {
      return { score: price > h2.price ? 0.6 : -0.8, reason: price > h2.price ? "شکست آخرین LH؛ هشدار تغییر خصلت (CHoCH صعودی)" : "ساختار نزولی (LH و LL)" };
    }
    if (price > h2.price) return { score: 0.7, reason: "شکست ساختار صعودی (BOS) بالای آخرین سقف" };
    if (price < l2.price) return { score: -0.7, reason: "شکست ساختار نزولی (BOS) زیر آخرین کف" };
    return none("ساختار بازار مختلط/رنج است");
  },
};

/* ---------------- Trend Detection ---------------- */
const trend: ModuleDef = {
  id: "trend",
  name: "Trend Detection",
  description: "شیب و کیفیت رگرسیون خطی قیمت (R²) نسبت به نوسان",
  defaultWeight: 1.2,
  defaultParams: { period: 50 },
  paramLabels: { period: "دوره رگرسیون" },
  run({ candles, atr: a }, p) {
    const closes = candles.slice(-p.period).map((c) => c.c);
    const { slope, r2 } = linreg(closes);
    const move = (slope * closes.length) / (a * 3);
    const score = clamp(move) * Math.sqrt(r2);
    return {
      score,
      reason: `روند ${score > 0.1 ? "صعودی" : score < -0.1 ? "نزولی" : "خنثی"} (کیفیت روند ${(r2 * 100).toFixed(0)}٪)`,
    };
  },
};

/* ---------------- Breakout ---------------- */
const breakout: ModuleDef = {
  id: "breakout",
  name: "Breakout Detection",
  description: "شکست کانال دانچیان همراه با تأیید حجم",
  defaultWeight: 1,
  defaultParams: { period: 20, volMult: 1.3 },
  paramLabels: { period: "دوره کانال", volMult: "ضریب حجم تأییدی" },
  run({ candles }, p) {
    const n = candles.length;
    const prior = candles.slice(n - 1 - p.period, n - 1);
    const hh = Math.max(...prior.map((c) => c.h));
    const ll = Math.min(...prior.map((c) => c.l));
    const avgV = prior.reduce((s, c) => s + c.v, 0) / prior.length;
    const b = candles[n - 1];
    const volOk = b.v > p.volMult * avgV;
    if (b.c > hh) return { score: volOk ? 1 : 0.7, reason: `شکست سقف ${p.period} کندلی ${volOk ? "با تأیید حجم" : "بدون تأیید حجم"}` };
    if (b.c < ll) return { score: volOk ? -1 : -0.7, reason: `شکست کف ${p.period} کندلی ${volOk ? "با تأیید حجم" : "بدون تأیید حجم"}` };
    return none("شکستی رخ نداده است");
  },
};

/* ---------------- Liquidity Sweep ---------------- */
const liquiditySweep: ModuleDef = {
  id: "liquiditySweep",
  name: "Liquidity Sweep",
  description: "جمع‌آوری نقدینگی بالای سقف/زیر کف و بازگشت قیمت",
  defaultWeight: 1,
  defaultParams: { lookback: 40, swingBars: 3 },
  paramLabels: { lookback: "بازه بررسی (کندل)", swingBars: "تعداد کندل سوینگ" },
  run({ candles }, p) {
    const n = candles.length;
    const hist = candles.slice(n - p.lookback, n - 3);
    const sw = swings(hist, p.swingBars, p.swingBars);
    const recent = candles.slice(-3);
    for (const l of sw.lows.slice().reverse()) {
      if (recent.some((c) => c.l < l.price && c.c > l.price) && candles[n - 1].c > l.price)
        return { score: 0.9, reason: `جمع‌آوری نقدینگی زیر کف ${fp(l.price)} و بازگشت به بالا` };
    }
    for (const h of sw.highs.slice().reverse()) {
      if (recent.some((c) => c.h > h.price && c.c < h.price) && candles[n - 1].c < h.price)
        return { score: -0.9, reason: `جمع‌آوری نقدینگی بالای سقف ${fp(h.price)} و بازگشت به پایین` };
    }
    return none("Sweep نقدینگی اخیر مشاهده نشد");
  },
};

export const MODULES: ModuleDef[] = [
  marketStructure,
  trend,
  emaModule,
  macdModule,
  rsiModule,
  volume,
  priceAction,
  supportResistance,
  supplyDemand,
  orderBlocks,
  fairValueGaps,
  breakout,
  liquiditySweep,
];

export function computeAtr(candles: Candle[], period = 14): number {
  const a = atr(candles, period);
  return n0(a[a.length - 1]);
}
