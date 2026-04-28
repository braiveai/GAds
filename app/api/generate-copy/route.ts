import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, angles, leanPercent, campaign, adGroup } = body;

    if (!brand || !campaign || !adGroup) {
      return NextResponse.json({ error: "Missing context" }, { status: 400 });
    }

    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 3500,
      system: `You are a senior copywriter at an Australian indie media agency, specifically writing Responsive Search Ads (RSAs) for Google Ads.

Hard rules:
- Headlines: max 30 characters each, no exceptions. Count carefully.
- Descriptions: max 90 characters each.
- AU English spelling.
- No exclamation marks, no excessive caps (one capitalised word at most), no special characters that Google Ads rejects.
- No superlatives Google rejects ("#1", "best in the world").
- Mix headline angles: benefit, USP, urgency, social proof, qualifier, CTA.
- Headline 1 should be a Dynamic Keyword Insertion (DKI) using the format {KeyWord:Default Headline} where Default Headline is under 30 chars.
- Use the brand's actual tone of voice.

Output strict JSON only.`,
      messages: [{
        role: "user",
        content: `Brand: ${brand.toneOfVoice}
Audience: ${brand.targetAudience}
USPs: ${brand.usps.join(" / ")}
Lean: ${leanPercent}% pain, ${100 - leanPercent}% aspiration
Pain angles to draw from: ${angles?.pain?.map((a: any) => a.title).join("; ") || "n/a"}
Aspiration angles: ${angles?.aspiration?.map((a: any) => a.title).join("; ") || "n/a"}

Campaign: ${campaign.name}
Ad group: ${adGroup.name}
Keywords (these trigger the ad): ${adGroup.keywords.map((k: any) => k.text).join(", ")}
Landing page: ${adGroup.landingPath || "/"}

Generate the full RSA asset set. Return ONLY this JSON:

{
  "headlines": [
    {"text": "{KeyWord:Default Headline}", "angle": "qualifier", "pin": 1},
    {"text": "Up to 30 characters", "angle": "benefit", "pin": null},
    ... 13 more (15 total)
  ],
  "descriptions": [
    {"text": "Up to 90 characters", "angle": "benefit"},
    ... 4 more (5 total)
  ],
  "paths": ["path-1", "path-2"],
  "sitelinks": [
    {"title": "Up to 25 chars", "desc1": "Up to 35 chars", "desc2": "Up to 35 chars"},
    ... 5 more (6 total)
  ]
}

Angles: "benefit" | "usp" | "urgency" | "proof" | "qualifier" | "cta"
Pin only headline 1 (the DKI). Other pins should be null.
Distribute angles: ~3 benefit, ~3 USP, ~2 urgency, ~2 proof, ~3 qualifier/CTA.`
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Post-process: ensure all headlines are <= 30 chars (counting DKI as the default text)
    parsed.headlines = parsed.headlines.map((h: any) => {
      const dkiMatch = h.text.match(/^\{KeyWord:([^}]+)\}$/);
      const visibleText = dkiMatch ? dkiMatch[1] : h.text;
      return {
        ...h,
        text: h.text,
        length: visibleText.length,
        overLimit: visibleText.length > 30,
        id: `h_${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
      };
    });
    parsed.descriptions = parsed.descriptions.map((d: any) => ({
      ...d,
      length: d.text.length,
      overLimit: d.text.length > 90,
      id: `d_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
    }));
    parsed.sitelinks = parsed.sitelinks.map((s: any) => ({
      ...s,
      id: `sl_${Math.random().toString(36).slice(2, 8)}`,
    }));

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("generate-copy error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
