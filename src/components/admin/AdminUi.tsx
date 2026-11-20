"use client";
import { useState, type ReactNode } from "react";
import type { AppConfig } from "@/lib/types";

export type AdminCfg = AppConfig & {
  moduleDefs: { id: string; name: string; description: string; paramLabels: Record<string, string> }[];
  aiEnvKey: boolean;
};
export type CfgCtx = { cfg: AdminCfg; save: (key: "engine" | "modules" | "sources" | "integrations", value: unknown) => Promise<void> };

export function Section({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card mb-4 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{title}</h3>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <div className="mt-1 text-sm text-white">{children}</div>
      {hint && <span className="mt-1 block text-[0.65rem] text-muted/80">{hint}</span>}
    </label>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await fn();
      setMsg({ ok: true, text: t || "انجام شد ✓" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <span className={`text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</span>;
}
