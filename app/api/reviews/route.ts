import { NextRequest, NextResponse } from "next/server";
import { ensureSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/reviews - create a new review for a build (snapshots campaigns)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { build_id, token, campaigns_snapshot, strategy_summary_snapshot, brand_url_snapshot, email_subject, email_body, client_email } = body || {};
    if (!build_id || !token) {
      return NextResponse.json({ error: "build_id and token required" }, { status: 400 });
    }
    const supa = ensureSupabase();
    const { data, error } = await supa
      .from("reviews")
      .insert({
        build_id,
        token,
        campaigns_snapshot,
        strategy_summary_snapshot,
        brand_url_snapshot,
        email_subject,
        email_body,
        client_email,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message, debug: error }, { status: 500 });

    // Bump parent build status to in_review
    await supa.from("builds").update({ status: "in_review" }).eq("id", build_id);

    return NextResponse.json({ review: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
