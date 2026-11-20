"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePoll } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";

const NAV = [
  { href: "/signals", label: "سیگنال‌ها", icon: "📡" },
  { href: "/trades", label: "معاملات باز", icon: "💹" },
  { href: "/chart", label: "نمودار زنده", icon: "📈" },
  { href: "/history", label: "تاریخچه", icon: "🗂️" },
  { href: "/admin", label: "مدیریت", icon: "⚙️" },
];

type Notif = { id: number; type: string; title: string; body: string; signalId: number | null; createdAt: string };

const TYPE_COLOR: Record<string, string> = { new: "#4f8cff", tp: "#16c784", sl: "#ea3943", close: "#f5a524", system: "#8794ab" };

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.14);
      o.stop(ctx.currentTime + i * 0.14 + 0.22);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio not available */
  }
}

function NotificationCenter() {
  const { data } = usePoll<{ items: Notif[] }>("/api/notifications", 6000);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [readUpTo, setReadUpTo] = useState(0);
  const initialised = useRef(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    setSound(localStorage.getItem("mr_sound") !== "off");
    setReadUpTo(Number(localStorage.getItem("mr_read") ?? 0));
  }, []);

  useEffect(() => {
    if (!data?.items) return;
    const maxId = data.items.reduce((m, n) => Math.max(m, n.id), 0);
    if (!initialised.current) {
      initialised.current = true;
      setLastSeen(maxId);
      return;
    }
    const fresh = data.items.filter((n) => n.id > (lastSeen ?? 0)).reverse();
    if (fresh.length) {
      setLastSeen(maxId);
      setToasts((t) => [...t, ...fresh].slice(-4));
      if (soundRef.current) beep();
      fresh.forEach((n) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 8000));
    }
  }, [data, lastSeen]);

  const items = data?.items ?? [];
  const unread = items.filter((n) => n.id > readUpTo).length;
  const toggleSound = useCallback(() => {
    const v = !sound;
    setSound(v);
    localStorage.setItem("mr_sound", v ? "on" : "off");
    if (v) beep();
  }, [sound]);
  const markRead = () => {
    const m = items.reduce((a, n) => Math.max(a, n.id), 0);
    setReadUpTo(m);
    localStorage.setItem("mr_read", String(m));
  };

  return (
    <>
      <button className="btn !px-2.5" onClick={toggleSound} title={sound ? "صدا فعال است" : "صدا خاموش است"} aria-label="تغییر وضعیت صدا">
        {sound ? "🔊" : "🔇"}
      </button>
      <div className="relative">
        <button
          className="btn relative !px-2.5"
          aria-label="اعلان‌ها"
          onClick={() => {
            setOpen((o) => !o);
            if (!open) markRead();
          }}
        >
          🔔
          {unread > 0 && <span className="absolute -top-1.5 -left-1.5 grid min-w-5 place-items-center rounded-full bg-down px-1 text-[0.65rem] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="card absolute left-0 z-50 mt-2 max-h-[70vh] w-[min(92vw,380px)] animate-fade-in overflow-y-auto p-2 shadow-2xl">
              <div className="px-3 py-2 text-sm font-bold">اعلان‌ها</div>
              {items.length === 0 && <div className="p-6 text-center text-sm text-muted">هنوز اعلانی ثبت نشده است.</div>}
              {items.map((n) => (
                <Link key={n.id} href={n.signalId ? "/trades" : "/signals"} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 hover:bg-white/5">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2 rounded-full" style={{ background: TYPE_COLOR[n.type] ?? "#8794ab" }} />
                    {n.title}
                  </div>
                  <div className="mt-1 text-xs text-muted">{n.body}</div>
                  <div className="mt-1 text-[0.65rem] text-muted/70">{timeAgo(n.createdAt)}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="pointer-events-none fixed bottom-20 left-3 z-[60] flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-4">
        {toasts.map((n) => (
          <div key={n.id} className="card pointer-events-auto animate-slide-in border-r-4 p-3 shadow-2xl" style={{ borderRightColor: TYPE_COLOR[n.type] }}>
            <div className="text-sm font-bold">{n.title}</div>
            <div className="mt-1 text-xs text-muted">{n.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function OnlinePill() {
  const { data, error } = usePoll<{ ok: boolean }>("/api/health", 20000);
  const online = Boolean(data?.ok) && !error;
  return (
    <span className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex ${online ? "border-up/40 text-up" : "border-down/40 text-down"}`}>
      <span className="inline-block size-2 animate-pulse-dot rounded-full bg-current" />
      {online ? "سیستم آنلاین" : "قطع ارتباط"}
    </span>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-3 sm:px-5">
          <Link href="/signals" className="flex items-center gap-2.5">
            <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-up text-lg shadow-lg shadow-brand/20">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" opacity=".5" />
                <circle cx="12" cy="12" r="4.5" opacity=".8" />
                <path d="M12 12 19 6" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-[0.95rem] font-extrabold tracking-tight">Meme Radar <span className="text-brand">Pro</span></span>
              <span className="block text-[0.62rem] text-muted">رادار سیگنال میم‌کوین‌ها</span>
            </span>
          </Link>
          <nav className="mx-2 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active(n.href) ? "bg-brand/15 text-brand" : "text-muted hover:bg-white/5 hover:text-white"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mr-auto flex items-center gap-2">
            <OnlinePill />
            <NotificationCenter />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-3 pb-24 pt-5 sm:px-5 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur-xl md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold ${active(n.href) ? "text-brand" : "text-muted"}`}>
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
