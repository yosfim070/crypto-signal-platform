import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const coins = pgTable("coins", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  coingeckoId: text("coingecko_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(), // BUY | SELL
    timeframe: text("timeframe").notNull(),
    entry: doublePrecision("entry").notNull(),
    stopLoss: doublePrecision("stop_loss").notNull(),
    currentSl: doublePrecision("current_sl").notNull(),
    tp1: doublePrecision("tp1").notNull(),
    tp2: doublePrecision("tp2").notNull(),
    tp3: doublePrecision("tp3").notNull(),
    support: doublePrecision("support"),
    resistance: doublePrecision("resistance"),
    confidence: integer("confidence").notNull(),
    riskReward: doublePrecision("risk_reward").notNull(),
    reason: text("reason").notNull(),
    breakdown: jsonb("breakdown"),
    // pending | active | success | failed | expired | stopped
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("engine"), // engine | manual
    dataSource: text("data_source"),
    tpHit: integer("tp_hit").notNull().default(0),
    closePrice: doublePrecision("close_price"),
    pnlPct: doublePrecision("pnl_pct"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signals_status_idx").on(t.status), index("signals_symbol_idx").on(t.symbol)],
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // new | tp | sl | close | system
  title: text("title").notNull(),
  body: text("body").notNull(),
  signalId: integer("signal_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const engineRuns = pgTable("engine_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer("duration_ms").notNull().default(0),
  scanned: integer("scanned").notNull().default(0),
  generated: integer("generated").notNull().default(0),
  errors: jsonb("errors"),
});
