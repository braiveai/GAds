import { NextRequest, NextResponse } from "next/server";
import { ensureSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const supa = ensureSupabase();
    const { data, error } = await supa.from("builds").select("*").eq("id", ctx.params.id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    // Also pull associated reviews
    const { data: reviews } = await supa
      .from("reviews")
      .select("*")
      .eq("build_id", ctx.params.id)
      .order("created_at", { ascending: false });
    return NextResponse.json({ build: data, reviews: reviews || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// DELETE = archive (soft delete)
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const supa = ensureSupabase();
    const { error } = await supa
      .from("builds")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", ctx.params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
