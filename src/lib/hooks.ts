"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function usePoll<T>(url: string | null, intervalMs: number, resetOnChange = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (urlRef.current !== u) return;
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `خطای سرور (${r.status})`);
      setData(j as T);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (urlRef.current === u) setError((e as Error).message || "خطا در ارتباط با سرور");
    } finally {
      if (urlRef.current === u) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    if (resetOnChange) {
      setData(null);
      setError(null);
    }
    load();
    if (!intervalMs || !url) return;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, intervalMs);
    return () => clearInterval(id);
  }, [url, intervalMs, load, resetOnChange]);

  return { data, error, loading, updatedAt, refresh: load };
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `خطای سرور (${r.status})`);
  return j as T;
}
