export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export const SOURCE_IDS = ["binance", "okx", "kucoin"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export const SOURCE_NAMES: Record<SourceId, string> = {
  binance: "Binance",
  okx: "OKX",
  kucoin: "KuCoin",
};

export type Direction = "BUY" | "SELL";
export type SignalStatus = "pending" | "active" | "success" | "failed" | "expired" | "stopped";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Ticker = {
  price: number;
  change24h: number; // percent
  volume24h: number; // quote (USD) volume
  high24h: number;
  low24h: number;
};

export type ModuleOutput = {
  score: number; // -1 (strong sell) .. +1 (strong buy)
  reason: string;
  levels?: { support?: number[]; resistance?: number[] };
};

export type ModuleBreakdown = {
  id: string;
  name: string;
  score: number;
  weight: number;
  reason: string;
};

export type EngineConfig = {
  engineEnabled: boolean;
  minConfidence: number;
  timeframes: Timeframe[];
  autoPublish: boolean;
  scanIntervalSec: number;
  expiryCandles: number;
  cooldownCandles: number;
  positionSizeUsd: number;
  atrMultiplier: number;
  maxSlPct: number;
  minRR: number;
};

export type ModuleConfig = { enabled: boolean; weight: number; params: Record<string, number> };
export type ModulesConfig = Record<string, ModuleConfig>;

export type SourcesConfig = {
  primary: SourceId;
  enabled: Record<SourceId, boolean>;
};

export type IntegrationsConfig = {
  telegramEnabled: boolean;
  telegramToken: string;
  telegramChatId: string;
  notifyNew: boolean;
  notifyTp: boolean;
  notifySl: boolean;
  notifyClose: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiKey: string;
};

export type AppConfig = {
  engine: EngineConfig;
  modules: ModulesConfig;
  sources: SourcesConfig;
  integrations: IntegrationsConfig;
};

export type SignalDTO = {
  id: number;
  symbol: string;
  direction: Direction;
  timeframe: Timeframe;
  entry: number;
  stopLoss: number;
  currentSl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  support: number | null;
  resistance: number | null;
  confidence: number;
  riskReward: number;
  reason: string;
  breakdown: ModuleBreakdown[] | null;
  status: SignalStatus;
  source: "engine" | "manual";
  dataSource: string | null;
  tpHit: number;
  closePrice: number | null;
  pnlPct: number | null;
  createdAt: string;
  closedAt: string | null;
  expiresAt: string;
};

export const STATUS_LABEL: Record<SignalStatus, string> = {
  pending: "در انتظار انتشار",
  active: "فعال",
  success: "موفق",
  failed: "ناموفق",
  expired: "منقضی",
  stopped: "متوقف",
};
