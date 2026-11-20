import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "mr_admin";
const TTL_MS = 12 * 3600 * 1000;

// Fail closed: never ship a known default administrator password.
export const adminPassword = () => process.env.ADMIN_PASSWORD || "";
export const isDefaultPassword = () => !process.env.ADMIN_PASSWORD;
const secret = () => process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "missing-admin-secret";
const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("hex");

export function makeToken() {
  const payload = String(Date.now() + TTL_MS);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !adminPassword()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}

export function checkPassword(pw: string): boolean {
  const configured = adminPassword();
  if (!configured) return false;
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  return verifyToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export const unauthorized = () => Response.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
