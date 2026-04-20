import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildTripEvents } from "@/lib/ingest/rebuild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/trips/{slug}/rebuild-events
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Bearer-token wrapper around `rebuildTripEvents`. Used for
 * CI/scripted invocation. The in-app "Обновить таймлайн" button
 * uses a server action instead; both share the same core.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const expected = process.env.WGT_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "WGT_INGEST_TOKEN is not configured on the server" },
      { status: 500 }
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { slug } = await ctx.params;
  const admin = createAdminClient();

  try {
    const res = await rebuildTripEvents(admin, slug);
    if (res.ok) return NextResponse.json(res);
    return NextResponse.json(
      { ok: false, stage: res.stage, error: res.error },
      { status: res.status }
    );
  } catch (outer) {
    return NextResponse.json(
      {
        ok: false,
        stage: "outer",
        error: (outer as Error).message,
        stack: (outer as Error).stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 }
    );
  }
}
