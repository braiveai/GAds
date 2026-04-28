import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, brand, angles, leanPercent, channels } = body;

    if (!brand) return NextResponse.json({ error: "Brand fingerprint required" }, { status: 400 });

    const channelList = Object.entries(channels || { search: true, pmax: true, demand: false })
      .filter(([_, v]) => v).map(([k]) => k).join(", ");

    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 4500,
      system: `You are an expert Google Ads strategist at Sunny Advertising, an indie agency in Melbourne. You design account architectures for medium-budget AU/NZ businesses. You know:
- MKAG (multi-keyword ad group, themed) - Sunny's default for established brands with broad keyword footprint
- SKAG (single keyword per ad group) - max control, used for high-intent or branded
- STAG (single theme, 5-15 keywords) - tightly grouped
- Hagakure (broad ad groups, lean on smart bidding) - Google's recommended for accounts with conversion data
- Custom - rare

You propose 2-4 themed campaigns based on the brand and channels. Each campaign has 1-3 ad groups with seed keywords. Use AU spelling. Naming convention: campaign name = "{Theme} x {Sub-theme} | SD", ad group name = "{Sub-theme} | {STRUCTURE}".`,
      messages: [{
        role: "user",
        content: `Brand: ${brand.toneOfVoice}
Audience: ${brand.targetAudience}
USPs: ${brand.usps.join(", ")}
Must-include keywords: ${brand.mustIncludeKeywords.join(", ")}
Lean: ${leanPercent}% pain / ${100 - leanPercent}% aspiration
Channels: ${channelList}
URL: ${url}

Pain angles: ${angles?.pain?.map((a: any) => a.title).join("; ") || "none"}
Aspiration angles: ${angles?.aspiration?.map((a: any) => a.title).join("; ") || "none"}

Propose 2-4 campaigns. Return ONLY valid JSON, no markdown.

{
  "campaigns": [
    {
      "name": "Theme x Sub-theme | SD",
      "structure": "MKAG" | "SKAG" | "STAG" | "Hagakure" | "Custom",
      "channelType": "Search" | "PMax" | "Demand",
      "budget": 2000,
      "locations": ["Brisbane North"],
      "bidStrategy": "Max conversions" | "Max conversion value" | "Target CPA" | "Target ROAS" | "Max clicks" | "Manual CPC",
      "audiences": ["In-market: ...", "Life event: ...", "Custom: ..."],
      "negatives": "newline-separated negatives like: free\\nDIY\\njobs",
      "aiNote": "1 sentence rationale or null",
      "adGroups": [
        {
          "name": "Sub-theme | MKAG",
          "landingPath": "/page-path",
          "aiNote": "1 sentence call-out or null",
          "keywords": [
            {"text": "lowercase keyword phrase", "match": "phrase" | "exact" | "broad"}
          ]
        }
      ]
    }
  ]
}

Realistic budgets for the AU market - typically $1k-$10k/mo per campaign for SMB. Keywords lowercase. Always include at least one "branded" or "generic" campaign. Match types should mostly be phrase, with exact for high-intent specific terms.`
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Add IDs and accents to make it ready for the UI
    const accents = ["#4A8C5C", "#5C6FFF", "#FF6B3D", "#0F9D6F", "#8B5A0A"];
    const enriched = parsed.campaigns.map((c: any, i: number) => ({
      ...c,
      id: `cm_${Math.random().toString(36).slice(2, 10)}`,
      accent: accents[i % accents.length],
      adGroups: c.adGroups.map((ag: any) => ({
        ...ag,
        id: `ag_${Math.random().toString(36).slice(2, 10)}`,
      })),
    }));

    return NextResponse.json({ campaigns: enriched });
  } catch (err: any) {
    console.error("propose-architecture error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
