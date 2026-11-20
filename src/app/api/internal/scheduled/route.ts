import { runScheduledTasks } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await runScheduledTasks();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[scheduled-engine]", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
