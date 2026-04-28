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

const ACCENTS = ["#FF66C3", "#1A1A1A", "#666666", "#E64FAB"];

const archTool = {
  name: "submit_architecture",
  description:
    "Submit the proposed Google Ads campaign architecture. Australian English. No em dashes - use hyphens. Include strategySummary explaining the overall approach and a clientRationale per campaign written so a non-technical client can understand WHY this campaign exists.",
  input_schema: {
    type: "object",
    properties: {
      strategySummary: {
        type: "string",
        description:
          "2-4 sentences explaining the overall strategy: how campaigns are themed, why this lean was chosen, how channels work together. Written for the AGENCY to brief their client.",
      },
      campaigns: {
        type: "array",
        description: "2 to 4 campaigns covering the brief and selected channels.",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "{Theme} x {Sub-theme} | {SUFFIX}" },
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
              description:
                "Campaign-level negative keywords (in addition to the account-level negatives the user has already supplied).",
            },
            aiNote: {
              type: "string",
              description: "Short internal note explaining strategist's reasoning for this campaign (1 sentence).",
            },
            clientRationale: {
              type: "string",
              description:
                "2-4 sentences in plain English explaining to a non-technical client WHY this campaign exists, what it targets, and how it differs from the others. Avoid jargon.",
              minLength: 80,
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
                    minItems: 1,
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
            "clientRationale",
            "adGroups",
          ],
        },
      },
    },
    required: ["strategySummary", "campaigns"],
  },
} as const;

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * For SKAG campaigns, split any ad group with >1 keyword into N ad groups,
 * one per keyword (in both PHR and EXC). This enforces the SKAG definition.
 */
function enforceSkagSplit(campaigns: any[]) {
  for (const c of campaigns) {
    if (c.structure !== "SKAG") continue;
    const newGroups: any[] = [];
    for (const g of c.adGroups || []) {
      const kws = g.keywords || [];
      if (kws.length <= 1) {
        newGroups.push(g);
        continue;
      }
      // Split: one group per keyword. Use TitleCase keyword as group sub-theme.
      for (const k of kws) {
        const subTheme = titleCase(k.text);
        newGroups.push({
          ...g,
          id: rid("g"),
          name: `${subTheme} | SKAG`,
          landingPath: g.landingPath,
          keywords: [
            { id: rid("k"), text: k.text, match: "PHR", estimatedVolume: k.estimatedVolume },
            { id: rid("k"), text: k.text, match: "EXC", estimatedVolume: k.estimatedVolume },
          ],
        });
      }
    }
    c.adGroups = newGroups;
  }
  return campaigns;
}

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };
  const t0 = Date.now();
  try {
    const body = await req.json();
    const {
      url,
      brand,
      angles,
      leanPercent,
      channels,
      nameSuffix = "SD",
      accountNegatives = [],
      userContext = {},
      brandGuidelines = "",
    } = body || {};

    if (!brand || !angles) {
      return NextResponse.json({ error: "brand and angles required", debug }, { status: 400 });
    }

    debug.input = {
      url,
      leanPercent,
      channels,
      nameSuffix,
      accountNegativesCount: accountNegatives.length,
      hasBrandGuidelines: !!brandGuidelines,
      userContextKeys: Object.keys(userContext).filter((k) => userContext[k]),
    };
    debug.steps.push("parsed body");

    const channelList = Array.isArray(channels) && channels.length > 0 ? channels : ["Search"];
    const lean = typeof leanPercent === "number" ? leanPercent : 50;
    const suffix = (nameSuffix || "SD").trim().toUpperCase().slice(0, 8) || "SD";

    const userContextBlock = [
      userContext.about ? `What the business does: ${userContext.about}` : "",
      userContext.audience ? `Ideal customer: ${userContext.audience}` : "",
      userContext.goals ? `Campaign goal: ${userContext.goals}` : "",
      userContext.notes ? `Other context: ${userContext.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const brandGuidelinesBlock = brandGuidelines.trim()
      ? `\n\nBRAND GUIDELINES (must inform tone and any do/don'ts):\n${brandGuidelines.trim().slice(0, 4000)}`
      : "";

    const accountNegBlock = accountNegatives.length
      ? `\n\nACCOUNT-WIDE NEGATIVES (already applied at account level - do NOT duplicate these in campaign negatives):\n${accountNegatives.join(", ")}`
      : "";

    const userText = `Propose a Google Ads campaign architecture for the brand below.

URL: ${url || "(not provided)"}

BRAND
- Tone of voice: ${brand.toneOfVoice || ""}
- Audience: ${brand.targetAudience || ""}
- USPs: ${(brand.usps || []).join("; ")}
- Must-include keywords: ${(brand.mustIncludeKeywords || []).join(", ")}
${userContextBlock ? `\nUSER-PROVIDED CONTEXT\n${userContextBlock}` : ""}${brandGuidelinesBlock}${accountNegBlock}

ANGLES (${lean}% aspiration lean - ${lean < 40 ? "favour pain framing" : lean > 60 ? "favour aspiration framing" : "balanced"})
PAIN:
${(angles.pain || []).map((a: any, i: number) => `${i + 1}. ${a.title} - ${a.desc}`).join("\n")}

ASPIRATION:
${(angles.aspiration || []).map((a: any, i: number) => `${i + 1}. ${a.title} - ${a.desc}`).join("\n")}

CHANNELS REQUESTED: ${channelList.join(", ")}

REQUIREMENTS
- Submit 2 to 4 campaigns via submit_architecture.
- Naming: campaign = "{Theme} x {Sub-theme} | ${suffix}", ad group = "{Sub-theme} | {STRUCTURE}".
- 2 to 4 ad groups per campaign (except SKAG, see below).
- Provide a top-level strategySummary AND a clientRationale per campaign written for a non-technical client.

STRUCTURE RULES (NON-NEGOTIABLE):
- SKAG (Single Keyword Ad Group): EXACTLY 1 keyword per ad group. The ad group name is the keyword in Title Case, e.g. "Solar Panel Quotes | SKAG". For SKAG campaigns, propose 3-6 ad groups, each with 1 keyword in PHR match (the system will auto-add EXC).
- STAG (Single Theme Ad Group): 1-3 closely related variants of the same root term per ad group (e.g. "solar quote", "solar quotes"). 3-5 ad groups per campaign.
- MKAG (Multiple Keyword Ad Group): 5-12 keywords per ad group, all on a tight theme. 2-4 ad groups per campaign.
- Hagakure: 1 ad group per campaign with 1-3 broad keywords + smart bidding. Designed to let Google's algorithm match.
- Custom: structure determined by the brief; explain in aiNote.

KEYWORD MATCH MIX:
- For SKAG: PHR only (system splits to PHR+EXC automatically).
- For others: mix PHR (most), EXC (your bread-and-butter for converting traffic), BRD (sparingly, only with smart bidding).

OUTPUT QUALITY:
- Australian English. No em dashes - use hyphens.
- Locations: AU-relevant (Australia, or specific states/cities for local intent).
- Audiences: prefer in-market and custom segments based on the brief.
- aiNote: 1 sentence, internal-facing strategist note.
- clientRationale: 2-4 sentences, plain English, NO jargon, explains WHY this campaign exists and how it's different from the others. The client should be able to read it and nod.`;

    const claudeStart = Date.now();
    const msg = await anthropic.messages.create({
      model: MODEL_STRATEGIST,
      max_tokens: 12000,
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

    const out = toolBlock.input as { strategySummary?: string; campaigns: any[] };
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

    // Enforce SKAG = exactly 1 keyword per ad group
    out.campaigns = enforceSkagSplit(out.campaigns);
    debug.skagSplitApplied = true;

    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ ...out, debug });
  } catch (err: any) {
    debug.error = err?.message || String(err);
    debug.stack = err?.stack;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ error: debug.error, debug }, { status: 500 });
  }
}
