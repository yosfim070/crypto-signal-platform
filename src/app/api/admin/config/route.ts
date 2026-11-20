import { MODULES } from "@/lib/analysis/modules";
import { isAdmin, unauthorized } from "@/lib/auth";
import { getConfig, maskSecret, setSetting } from "@/lib/config";
import { SOURCE_IDS, TIMEFRAMES, type AppConfig, type EngineConfig, type IntegrationsConfig, type ModulesConfig, type SourceId } from "@/lib/types";

export const dynamic = "force-dynamic";

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function view(cfg: AppConfig) {
  return {
    ...cfg,
    integrations: {
      ...cfg.integrations,
      telegramToken: maskSecret(cfg.integrations.telegramToken),
      aiKey: maskSecret(cfg.integrations.aiKey),
    },
    moduleDefs: MODULES.map((m) => ({ id: m.id, name: m.name, description: m.description, paramLabels: m.paramLabels })),
    aiEnvKey: Boolean(process.env.OPENAI_API_KEY),
  };
}

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json(view(await getConfig(true)));
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const { key, value } = (await req.json().catch(() => ({}))) as { key?: string; value?: Record<string, unknown> };
  if (!value || typeof value !== "object") return Response.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const cur = await getConfig(true);

  if (key === "engine") {
    const v = value as Partial<EngineConfig>;
    const tfs = (Array.isArray(v.timeframes) ? v.timeframes : cur.engine.timeframes).filter((t) => TIMEFRAMES.includes(t));
    if (!tfs.length) return Response.json({ error: "حداقل یک تایم‌فریم لازم است" }, { status: 400 });
    const next: EngineConfig = {
      engineEnabled: Boolean(v.engineEnabled ?? cur.engine.engineEnabled),
      autoPublish: Boolean(v.autoPublish ?? cur.engine.autoPublish),
      timeframes: tfs,
      minConfidence: num(v.minConfidence, 30, 99, cur.engine.minConfidence),
      scanIntervalSec: num(v.scanIntervalSec, 30, 3600, cur.engine.scanIntervalSec),
      expiryCandles: num(v.expiryCandles, 4, 500, cur.engine.expiryCandles),
      cooldownCandles: num(v.cooldownCandles, 0, 200, cur.engine.cooldownCandles),
      positionSizeUsd: num(v.positionSizeUsd, 1, 1e7, cur.engine.positionSizeUsd),
      atrMultiplier: num(v.atrMultiplier, 0.5, 6, cur.engine.atrMultiplier),
      maxSlPct: num(v.maxSlPct, 0.5, 30, cur.engine.maxSlPct),
      minRR: num(v.minRR, 0.5, 10, cur.engine.minRR),
    };
    await setSetting("engine", next);
  } else if (key === "modules") {
    const v = value as ModulesConfig;
    const next: ModulesConfig = {};
    for (const def of MODULES) {
      const m = v[def.id] ?? cur.modules[def.id];
      const params: Record<string, number> = {};
      for (const [pk, dv] of Object.entries(def.defaultParams)) params[pk] = num(m.params?.[pk], 1e-6, 1000, dv);
      next[def.id] = { enabled: Boolean(m.enabled), weight: num(m.weight, 0, 10, def.defaultWeight), params };
    }
    await setSetting("modules", next);
  } else if (key === "sources") {
    const v = value as { primary?: SourceId; enabled?: Record<SourceId, boolean> };
    const enabled = { ...cur.sources.enabled };
    for (const s of SOURCE_IDS) if (v.enabled && typeof v.enabled[s] === "boolean") enabled[s] = v.enabled[s];
    if (!SOURCE_IDS.some((s) => enabled[s])) return Response.json({ error: "حداقل یک منبع داده باید فعال باشد" }, { status: 400 });
    let primary = v.primary && SOURCE_IDS.includes(v.primary) ? v.primary : cur.sources.primary;
    if (!enabled[primary]) primary = SOURCE_IDS.find((s) => enabled[s])!;
    await setSetting("sources", { primary, enabled });
  } else if (key === "integrations") {
    const v = value as Partial<IntegrationsConfig>;
    const keep = (nv: unknown, old: string) => (typeof nv === "string" && !nv.startsWith("•") ? nv.trim() : old);
    const next: IntegrationsConfig = {
      telegramEnabled: Boolean(v.telegramEnabled),
      telegramToken: keep(v.telegramToken, cur.integrations.telegramToken),
      telegramChatId: typeof v.telegramChatId === "string" ? v.telegramChatId.trim() : cur.integrations.telegramChatId,
      notifyNew: Boolean(v.notifyNew),
      notifyTp: Boolean(v.notifyTp),
      notifySl: Boolean(v.notifySl),
      notifyClose: Boolean(v.notifyClose),
      aiBaseUrl: typeof v.aiBaseUrl === "string" && /^https?:\/\//.test(v.aiBaseUrl) ? v.aiBaseUrl.trim() : cur.integrations.aiBaseUrl,
      aiModel: typeof v.aiModel === "string" && v.aiModel.trim() ? v.aiModel.trim() : cur.integrations.aiModel,
      aiKey: keep(v.aiKey, cur.integrations.aiKey),
    };
    await setSetting("integrations", next);
  } else return Response.json({ error: "کلید نامعتبر" }, { status: 400 });

  return Response.json(view(await getConfig(true)));
}
