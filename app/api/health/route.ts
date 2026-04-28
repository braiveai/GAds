import { NextResponse } from "next/server";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const apiKeyPrefix = apiKey ? apiKey.slice(0, 12) + "..." : "(missing)";

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not set", apiKeyPrefix, elapsedMs: Date.now() - started },
      { status: 500 }
    );
  }

  try {
    const msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with just the word: ok" }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    return NextResponse.json({
      ok: true,
      model: MODEL_FAST,
      reply: text.trim(),
      elapsedMs: Date.now() - started,
      apiKeyPrefix,
      usage: msg.usage,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || String(err),
        status: err?.status,
        apiKeyPrefix,
        elapsedMs: Date.now() - started,
      },
      { status: err?.status || 500 }
    );
  }
}
