import { NextRequest, NextResponse } from "next/server";
import { ensureSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reviews/[token] - load review session for client
export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  try {
    const supa = ensureSupabase();
    const { data: review, error } = await supa
      .from("reviews")
      .select("*")
      .eq("token", ctx.params.token)
      .single();
    if (error || !review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    // Mark last viewed
    supa.from("reviews").update({ last_viewed_at: new Date().toISOString() }).eq("id", review.id).then(() => {});

    // Pull existing approvals for this review
    const { data: approvals } = await supa
      .from("approvals")
      .select("*")
      .eq("review_id", review.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ review, approvals: approvals || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// POST /api/reviews/[token] - log an approval/note/reset
// Body: { scope: 'build'|'campaign'|'adgroup'|'variation', scope_id?: string, status: 'approved'|'note'|'reset', note_text?: string, general_feedback?: string }
export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  try {
    const body = await req.json();
    const { scope, scope_id, status, note_text, general_feedback } = body || {};
    const supa = ensureSupabase();
    const { data: review } = await supa.from("reviews").select("id, build_id").eq("token", ctx.params.token).single();
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    if (general_feedback !== undefined) {
      await supa.from("reviews").update({ general_feedback }).eq("id", review.id);
    }

    if (scope && status) {
      // For 'reset', delete prior approvals at the same scope+scope_id
      if (status === "reset") {
        let q = supa.from("approvals").delete().eq("review_id", review.id).eq("scope", scope);
        if (scope_id) q = q.eq("scope_id", scope_id);
        else q = q.is("scope_id", null);
        await q;
      } else {
        await supa.from("approvals").insert({
          review_id: review.id,
          scope,
          scope_id: scope_id || null,
          status,
          note_text: note_text || null,
        });
      }
    }

    // If a 'build' scope was approved, mark the build approved
    if (scope === "build" && status === "approved") {
      await supa.from("builds").update({ status: "approved" }).eq("id", review.build_id);
      await supa.from("reviews").update({ completed_at: new Date().toISOString() }).eq("id", review.id);
    }

    // Return the updated state
    const { data: approvals } = await supa
      .from("approvals")
      .select("*")
      .eq("review_id", review.id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ ok: true, approvals: approvals || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
