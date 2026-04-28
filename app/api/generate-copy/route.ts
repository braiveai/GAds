import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ANGLES = ["benefit", "usp", "urgency", "proof", "qualifier", "cta"] as const;

const copyTool = {
  name: "submit_rsa_copy",
  description:
    "Submit Google Ads RSA copy. Australian English. Title Case headlines, sentence case descriptions/paths/sitelinks. No em dashes — use hyphens.",
  input_schema: {
    type: "object",
    properties: {
      headlines: {
        type: "array",
        description:
          "Exactly 15 headlines. Headline 1 must be DKI in the form '{KeyWord:Default Text}' with pin = 1. Default text must be <= 30 characters. Other headlines <= 30 chars. Most headlines should have pin = null. A small number can have pin 2 or 3.",
        minItems: 15,
        maxItems: 15,
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            angle: { type: "string", enum: [...ANGLES] },
            pin: { type: ["integer", "null"], enum: [1, 2, 3, null] },
          },
          required: ["text", "angle", "pin"],
        },
      },
      descriptions: {
        type: "array",
        description: "Exactly 5 descriptions, each <= 90 characters.",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            angle: { type: "string", enum: [...ANGLES] },
            pin: { type: ["integer", "null"], enum: [1, 2, null] },
          },
          required: ["text", "angle", "pin"],
        },
      },
      paths: {
        type: "array",
        description: "Exactly 2 display paths, each <= 15 characters, sentence case, no spaces (use hyphens).",
        minItems: 2,
        maxItems: 2,
        items: { type: "string" },
      },
      sitelinks: {
        type: "array",
        description: "Exactly 6 sitelinks, sentence case.",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Sitelink headline, <= 25 chars" },
            desc1: { type: "string", description: "Description 1, <= 35 chars" },
            desc2: { type: "string", description: "Description 2, <= 35 chars" },
          },
          required: ["text", "desc1", "desc2"],
        },
      },
    },
    required: ["headlines", "descriptions", "paths", "sitelinks"],
  },
} as const;

function dkiVisible(text: string): { isDki: boolean; visible: string } {
  // {KeyWord:Default text} variants
  const m = text.match(/^\s*\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}\s*$/);
  if (m) return { isDki: true, visible: m[1] };
  return { isDki: false, visible: text };
}

function rid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };
  const t0 = Date.now();
  try {
    const body = await req.json();
    const { brand, angles, leanPercent, campaign, adGroup } = body || {};
    if (!campaign || !adGroup) {
      return NextResponse.json({ error: "campaign and adGroup required", debug }, { status: 400 });
    }

    const lean = typeof leanPercent === "number" ? leanPercent : 50;
    const kwList = (adGroup.keywords || []).map((k: any) => k.text).filter(Boolean);
    const dkiDefault = kwList[0] || (brand?.mustIncludeKeywords?.[0] ?? "Get Started");

    const userText = `Generate Google Ads RSA copy for the ad group below. Submit via submit_rsa_copy.

BRAND
- Tone: ${brand?.toneOfVoice || ""}
- Audience: ${brand?.targetAudience || ""}
- USPs: ${(brand?.usps || []).join("; ")}
- Must-include keywords: ${(brand?.mustIncludeKeywords || []).join(", ")}

ANGLE LEAN
- ${lean}% aspiration. ${lean < 40 ? "Favour pain framing." : lean > 60 ? "Favour aspiration framing." : "Balanced."}

CAMPAIGN: ${campaign.name} (${campaign.structure}, ${campaign.channelType})
AD GROUP: ${adGroup.name}
LANDING PATH: ${adGroup.landingPath || "/"}
KEYWORDS: ${kwList.join(", ")}

REQUIREMENTS
- Exactly 15 headlines. Headline 1 = DKI: "{KeyWord:${dkiDefault}}" with pin = 1. Default text <= 30 chars.
- Other 14 headlines: <= 30 chars each. Mix of angles. Most pin = null.
- Exactly 5 descriptions, <= 90 chars each.
- Exactly 2 display paths, <= 15 chars, sentence case, hyphens not spaces.
- Exactly 6 sitelinks (text + desc1 + desc2).
- Australian English. Title Case headlines. Sentence case for descriptions/paths/sitelinks. No em dashes.
- Distribute angles roughly: 3 benefit, 3 usp, 2 urgency, 2 proof, 3 qualifier/cta. (Headline 1 is benefit.)`;

    const claudeStart = Date.now();
    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 4000,
      tools: [copyTool] as any,
      tool_choice: { type: "tool", name: "submit_rsa_copy" } as any,
      messages: [{ role: "user", content: userText }],
    });
    debug.claudeMs = Date.now() - claudeStart;
    debug.usage = msg.usage;
    debug.stopReason = msg.stop_reason;

    const toolBlock = msg.content.find((b: any) => b.type === "tool_use") as any;
    if (!toolBlock?.input) {
      debug.rawContent = msg.content;
      return NextResponse.json({ error: "No tool_use returned", debug }, { status: 502 });
    }

    const out = toolBlock.input as any;

    // Post-process headlines
    out.headlines = (out.headlines || []).map((h: any, i: number) => {
      const { isDki, visible } = dkiVisible(h.text);
      return {
        ...h,
        id: rid("h"),
        length: visible.length,
        overLimit: visible.length > 30,
        isDki,
        index: i + 1,
      };
    });
    // Force pin=1 on first headline
    if (out.headlines[0]) out.headlines[0].pin = 1;

    out.descriptions = (out.descriptions || []).map((d: any, i: number) => ({
      ...d,
      id: rid("d"),
      length: (d.text || "").length,
      overLimit: (d.text || "").length > 90,
      index: i + 1,
    }));

    out.paths = (out.paths || []).map((p: string) => p);

    out.sitelinks = (out.sitelinks || []).map((s: any) => ({
      ...s,
      id: rid("sl"),
    }));

    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ ...out, debug });
  } catch (err: any) {
    debug.error = err?.message || String(err);
    debug.stack = err?.stack;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ error: debug.error, debug }, { status: 500 });
  }
}
