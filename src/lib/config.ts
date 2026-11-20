import { db } from "@/db";
import { coins, settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { MODULES } from "@/lib/analysis/modules";
import type { AppConfig, EngineConfig, IntegrationsConfig, ModulesConfig, SourcesConfig } from "@/lib/types";

export const DEFAULT_ENGINE: EngineConfig = {
  engineEnabled: true,
  minConfidence: 65,
  timeframes: ["15m", "1h", "4h"],
  autoPublish: true,
  scanIntervalSec: 120,
  expiryCandles: 48,
  cooldownCandles: 6,
  positionSizeUsd: 1000,
  atrMultiplier: 1.5,
  maxSlPct: 8,
  minRR: 1,
};

export const DEFAULT_SOURCES: SourcesConfig = {
  primary: "binance",
  enabled: { binance: true, okx: true, kucoin: true },
};

export const DEFAULT_INTEGRATIONS: IntegrationsConfig = {
  telegramEnabled: false,
  telegramToken: "",
  telegramChatId: "",
  notifyNew: true,
  notifyTp: true,
  notifySl: true,
  notifyClose: true,
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "gpt-4o-mini",
  aiKey: "",
};

export function defaultModules(): ModulesConfig {
  const out: ModulesConfig = {};
  for (const m of MODULES) out[m.id] = { enabled: true, weight: m.defaultWeight, params: { ...m.defaultParams } };
  return out;
}

const DEFAULT_COINS: [string, string, string][] = [
  ["DOGE", "Dogecoin", "dogecoin"],
  ["SHIB", "Shiba Inu", "shiba-inu"],
  ["PEPE", "Pepe", "pepe"],
  ["FLOKI", "Floki", "floki"],
  ["BONK", "Bonk", "bonk"],
  ["WIF", "dogwifhat", "dogwifcoin"],
  ["BOME", "Book of Meme", "book-of-meme"],
  ["PNUT", "Peanut the Squirrel", "peanut-the-squirrel"],
  ["TURBO", "Turbo", "turbo"],
  ["PENGU", "Pudgy Penguins", "pudgy-penguins"],
  ["TRUMP", "Official Trump", "official-trump"],
];

let seeded: Promise<void> | null = null;
export function ensureSeed(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(coins);
      if (count === 0) {
        await db
          .insert(coins)
          .values(DEFAULT_COINS.map(([symbol, name, coingeckoId]) => ({ symbol, name, coingeckoId })))
          .onConflictDoNothing();
      }
    })().catch((e) => {
      seeded = null;
      throw e;
    });
  }
  return seeded;
}

let cache: { at: number; data: AppConfig } | null = null;

export async function getConfig(force = false): Promise<AppConfig> {
  if (!force && cache && Date.now() - cache.at < 3000) return cache.data;
  const rows = await db.select().from(settings);
  const m = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));
  const mods = defaultModules();
  const storedMods = (m.get("modules") ?? {}) as Partial<ModulesConfig>;
  for (const id of Object.keys(mods)) {
    const s = storedMods[id];
    if (s) mods[id] = { enabled: s.enabled ?? true, weight: s.weight ?? mods[id].weight, params: { ...mods[id].params, ...(s.params ?? {}) } };
  }
  const data: AppConfig = {
    engine: { ...DEFAULT_ENGINE, ...(m.get("engine") as Partial<EngineConfig> | undefined) },
    modules: mods,
    sources: {
      ...DEFAULT_SOURCES,
      ...(m.get("sources") as Partial<SourcesConfig> | undefined),
      enabled: { ...DEFAULT_SOURCES.enabled, ...((m.get("sources") as Partial<SourcesConfig> | undefined)?.enabled ?? {}) },
    },
    integrations: { ...DEFAULT_INTEGRATIONS, ...(m.get("integrations") as Partial<IntegrationsConfig> | undefined) },
  };
  cache = { at: Date.now(), data };
  return data;
}

export async function setSetting(key: "engine" | "modules" | "sources" | "integrations", value: unknown) {
  await db
    .insert(settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
  cache = null;
}

export async function getSettingRaw(key: string) {
  const [r] = await db.select().from(settings).where(eq(settings.key, key));
  return r?.value;
}

export function maskSecret(s: string) {
  return s ? `${"•".repeat(8)}${s.slice(-4)}` : "";
}
