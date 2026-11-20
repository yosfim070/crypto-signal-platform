import type { Candle } from "@/lib/types";

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start < 0 || values.length - start < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = start; i < start + period; i++) seed += values[i];
  let prev = seed / period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  g /= period;
  l /= period;
  out[period] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    g = (g * (period - 1) + Math.max(d, 0)) / period;
    l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => ef[i] - es[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr: number[] = candles.map((c, i) =>
    i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)),
  );
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export type Swing = { i: number; price: number };

export function swings(candles: Candle[], left = 3, right = 3): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= left && (isHigh || isLow); j++) {
      if (candles[i - j].h >= candles[i].h) isHigh = false;
      if (candles[i - j].l <= candles[i].l) isLow = false;
    }
    for (let j = 1; j <= right && (isHigh || isLow); j++) {
      if (candles[i + j].h > candles[i].h) isHigh = false;
      if (candles[i + j].l < candles[i].l) isLow = false;
    }
    if (isHigh) highs.push({ i, price: candles[i].h });
    if (isLow) lows.push({ i, price: candles[i].l });
  }
  return { highs, lows };
}

export function linreg(values: number[]): { slope: number; r2: number } {
  const n = values.length;
  if (n < 3) return { slope: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
    sxy += i * values[i];
    sxx += i * i;
    syy += values[i] * values[i];
  }
  const den = n * sxx - sx * sx;
  const slope = (n * sxy - sx * sy) / den;
  const num = n * sxy - sx * sy;
  const d2 = (n * sxx - sx * sx) * (n * syy - sy * sy);
  const r2 = d2 === 0 ? 0 : (num * num) / d2;
  return { slope, r2 };
}

export const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
export const lastOf = <T>(a: T[], n = 1): T => a[a.length - n];
