import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkPassword, isAdmin, isDefaultPassword, makeToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; until: number }>();

export async function GET() {
  return Response.json({ authed: await isAdmin(), defaultPassword: isDefaultPassword() });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return Response.json({ error: "تلاش‌های ناموفق زیاد؛ چند دقیقه بعد دوباره امتحان کنید" }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return Response.json({ error: "رمز عبور نادرست است" }, { status: 401 });
  }
  attempts.delete(ip);
  (await cookies()).set(ADMIN_COOKIE, makeToken(), { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 12 * 3600 });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
