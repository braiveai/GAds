import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_STRATEGIST } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STRUCTURE_OPTIONS = ["MKAG", "SKAG", "STAG", "Hagakure", "Custom"] as const;
const CHANNEL_OPTIONS = ["Search", "PMax", "Demand"] as const;
const BID_STRATEGIES = [
  "Maximise conversions",
  "Maximise conversion value",
  "Target CPA",
  "Target ROAS",
  "Manual CPC",
  "Maximise clicks",
] as const;
const MATCH_OPTIONS = ["PHR", "EXC", "BRD"] as const;

const ACCENTS = ["#2541E8", "#0F9D6F", "#1F6E8C", "#C24A1F"];

const archTool = {
  name: "submit_architecture",
  description:
    "Submit the proposed Google Ads campaign architecture. Use Australian English. No em dashes. Naming convention: campaign = '{Theme} x {Sub-theme} | SD', ad group = '{Sub-theme} | {STRUCTURE}'.",
  input_schema: {
    type: "object",
    properties: {
      campaigns: {
        type: "array",
        description: "2 to 4 campaigns covering the brief and selected channels.",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "{Theme} x {Sub-theme} | SD" },
            structure: { type: "string", enum: [...STRUCTURE_OPTIONS] },
            channelType: { type: "string", enum: [...CHANNEL_OPTIONS] },
            budget: { type: "number", description: "Daily budget in AUD." },
            locations: {
              type: "array",
              items: { type: "string" },
              description: "Australian states or cities. Default to a sensible national or metro mix.",
            },
            bidStrategy: { type: "string", enum: [...BID_STRATEGIES] },
            audiences: {
              type: "array",
              items: { type: "string" },
              description: "Audience signals or segments (in-market, custom, etc).",
            },
            negatives: {
              type: "array",
              items: { type: "string" },
              description: "Account or campaign negative keywords.",
            },
            aiNote: {
              type: "string",
              description: "One short strategist note explaining the rationale for this campaign.",
            },
            adGroups: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "{Sub-theme} | {STRUCTURE}" },
                  landingPath: {
                    type: "string",
                    description: "Path on the brand's site, leading slash (e.g. /solar-quotes).",
                  },
                  keywords: {
                    type: "array",
                    minItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        match: { type: "string", enum: [...MATCH_OPTIONS] },
                        estimatedVolume: {
                          type: "string",
                          description: "Rough volume bucket: low / med / high.",
                        },
                      },
                      required: ["text", "match", "estimatedVolume"],
                    },
                  },
                },
                required: ["name", "landingPath", "keywords"],
              },
            },
          },
          required: [
            "name",
            "structure",
            "channelType",
            "budget",
            "locations",
            "bidStrategy",
            "audiences",
            "negatives",
            "aiNote",
            "adGroups",
          ],
        },
      },
    },
    required: ["campaigns"],
  },
} as const;

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };
  const t0 = Date.now();
  try {
    const body = await req.json();
    const { url, brand, angles, leanPercent, channels } = body || {};
    if (!brand || !angles) {
      return NextResponse.json({ error: "brand and angles required", debug }, { status: 400 });
    }

    debug.input = { url, leanPercent, channels, hasBrand: !!brand, hasAngles: !!angles };
    debug.steps.push("parsed body");

    const channelList = Array.isArray(channels) && channels.length > 0 ? channels : ["Search"];
    const lean = typeof leanPercent === "number" ? leanPercent : 50;

    const userText = `Propose a Google Ads campaign architecture for the brand below.

URL: ${url || "(not provided)"}

BRAND
- Tone of voice: ${brand.toneOfVoice || ""}
- Audience: ${brand.targetAudience || ""}
- USPs: ${(brand.usps || []).join("; ")}
- Must-include keywords: ${(brand.mustIncludeKeywords || []).join(", ")}

ANGLES (${lean}% aspiration lean — ${lean < 50 ? "favour pain framing" : lean > 50 ? "favour aspiration framing" : "balanced"})
PAIN:
${(angles.pain || []).map((a: any, i: number) => `${i + 1}. ${a.title} — ${a.desc}`).join("\n")}

ASPIRATION:
${(angles.aspiration || []).map((a: any, i: number) => `${i + 1}. ${a.title} — ${a.desc}`).join("\n")}

CHANNELS REQUESTED: ${channelList.join(", ")}

REQUIREMENTS
- Submit 2 to 4 campaigns via submit_architecture.
- Each campaign uses one of: MKAG / SKAG / STAG / Hagakure / Custom for structure, and one of: Search / PMax / Demand for channelType.
- Naming: campaign = "{Theme} x {Sub-theme} | SD", ad group = "{Sub-theme} | {STRUCTURE}".
- 2 to 4 ad groups per campaign.
- 5 to 12 keywords per ad group, mix PHR/EXC/BRD.
- Provide locations (AU), bidStrategy, audiences, negatives, aiNote.
- Australian English. No em dashes.`;

    const claudeStart = Date.now();
    const msg = await anthropic.messages.create({
      model: MODEL_STRATEGIST,
      max_tokens: 8000,
      tools: [archTool] as any,
      tool_choice: { type: "tool", name: "submit_architecture" } as any,
      messages: [{ role: "user", content: userText }],
    });
    debug.claudeMs = Date.now() - claudeStart;
    debug.usage = msg.usage;
    debug.stopReason = msg.stop_reason;
    debug.steps.push("Claude returned");

    const toolBlock = msg.content.find((b: any) => b.type === "tool_use") as any;
    if (!toolBlock?.input) {
      debug.rawContent = msg.content;
      return NextResponse.json({ error: "No tool_use returned", debug }, { status: 502 });
    }

    const out = toolBlock.input as { campaigns: any[] };
    // attach ids and accents
    out.campaigns = out.campaigns.map((c, ci) => ({
      ...c,
      id: rid("c"),
      accent: ACCENTS[ci % ACCENTS.length],
      adGroups: (c.adGroups || []).map((g: any) => ({
        ...g,
        id: rid("g"),
        keywords: (g.keywords || []).map((k: any) => ({ ...k, id: rid("k") })),
      })),
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
