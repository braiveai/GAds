import { NextRequest, NextResponse } from "next/server";
import { ensureSupabase, DEMO_USER_ID } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/builds - list builds for current user (with review summary)
export async function GET(req: NextRequest) {
  try {
    const supa = ensureSupabase();
    const { data, error } = await supa
      .from("builds_with_review_summary")
      .select("*")
      .eq("agency_user_id", DEMO_USER_ID)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message, debug: error }, { status: 500 });
    }
    return NextResponse.json({ builds: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// POST /api/builds - create or upsert a build (full state save)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id, // if provided, update; else create
      brand_name,
      brand_url,
      status,
      brief,
      user_context,
      brand_guidelines,
      name_suffix,
      account_negatives,
      channels,
      lean_value,
      campaign_count,
      prioritized_angles,
      discovered_pages,
      selected_pages,
      pinned_pages,
      strategy_summary,
      campaigns,
    } = body || {};

    const supa = ensureSupabase();
    const payload: any = {
      agency_user_id: DEMO_USER_ID,
      brand_name,
      brand_url,
      brief,
      user_context: user_context || {},
      brand_guidelines: brand_guidelines || "",
      name_suffix: name_suffix || "SA",
      account_negatives: account_negatives || [],
      channels: channels || ["Search"],
      lean_value: typeof lean_value === "number" ? lean_value : 50,
      campaign_count: typeof campaign_count === "number" ? campaign_count : 0,
      prioritized_angles: prioritized_angles || [],
      discovered_pages: discovered_pages || [],
      selected_pages: selected_pages || [],
      pinned_pages: pinned_pages || [],
      strategy_summary: strategy_summary || "",
      campaigns: campaigns || [],
    };
    if (status) payload.status = status;

    if (id) {
      const { data, error } = await supa.from("builds").update(payload).eq("id", id).select().single();
      if (error) return NextResponse.json({ error: error.message, debug: error }, { status: 500 });
      return NextResponse.json({ build: data });
    } else {
      const { data, error } = await supa.from("builds").insert(payload).select().single();
      if (error) return NextResponse.json({ error: error.message, debug: error }, { status: 500 });
      return NextResponse.json({ build: data });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
