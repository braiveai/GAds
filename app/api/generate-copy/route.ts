import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ANGLES = ["benefit", "usp", "urgency", "proof", "qualifier", "cta"] as const;

const copyTool = {
  name: "submit_rsa_copy",
  description:
    "Submit Google Ads RSA copy. Australian English. Title Case headlines, sentence case descriptions/paths/sitelinks. No em dashes - use hyphens. STRICT character limits enforced.",
  input_schema: {
    type: "object",
    properties: {
      headlines: {
        type: "array",
        description:
          "Exactly 15 headlines. Headline 1 must be DKI in the form '{KeyWord:Default Text}' with pin = 1. Default text must be <= 30 characters. Other headlines <= 30 chars. Most headlines should have pin = null.",
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
        description:
          "Exactly 5 descriptions. EACH MUST BE <= 90 CHARACTERS INCLUDING SPACES. Count carefully before submitting. If your draft exceeds 90, shorten it.",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 90 },
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
        items: { type: "string", maxLength: 15 },
      },
      sitelinks: {
        type: "array",
        description: "Exactly 6 sitelinks, sentence case.",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Sitelink headline, <= 25 chars", maxLength: 25 },
            desc1: { type: "string", description: "Description 1, <= 35 chars", maxLength: 35 },
            desc2: { type: "string", description: "Description 2, <= 35 chars", maxLength: 35 },
          },
          required: ["text", "desc1", "desc2"],
        },
      },
    },
    required: ["headlines", "descriptions", "paths", "sitelinks"],
  },
} as const;

function dkiVisible(text: string): { isDki: boolean; visible: string } {
  const m = text.match(/^\s*\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}\s*$/);
  if (m) return { isDki: true, visible: m[1] };
  return { isDki: false, visible: text };
}

function rid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Trim a string to maxLen at a word boundary if possible. */
function smartClip(s: string, maxLen: number): string {
  if (!s || s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  // Always prefer the last whole-word boundary, even if it means dropping more characters.
  // Falling back to a hard mid-word cut creates ugly fragments like "30 full-time Australian professiona".
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).replace(/[\s\-,.;:!]+$/, "");
  }
  // Single very long word - just take the slice (rare edge case)
  return slice.replace(/[\s\-,.;:!]+$/, "");
}

/** Strip trailing words that suggest a fragment / mid-sentence cutoff */
function stripPartialThought(s: string): string {
  if (!s) return s;
  // Includes: prepositions, conjunctions, articles, determiners, relative pronouns, possessives, complementizers
  const trailingFragmentWords = /\s+(and|or|but|with|for|to|of|the|a|an|your|our|my|its|his|her|their|in|on|at|by|from|that|which|who|whom|whose|when|where|while|so|as|like|than|because|since|if|though|although|after|before|over|under|into|onto|about|across|through|during|without|within|upon|around|behind|beside|beneath|beyond|despite|except)\s*[.,;:]?\s*$/i;
  let cleaned = s.trim();
  // Apply repeatedly so 'into the' becomes '' not 'into'
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(trailingFragmentWords, "").trim();
  } while (cleaned !== prev && cleaned.length > 0);
  // Strip trailing punctuation if we removed any words
  if (cleaned !== s.trim()) {
    cleaned = cleaned.replace(/[,;:]+$/, "").trim();
  }
  return cleaned;
}

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };
  const t0 = Date.now();
  try {
    const body = await req.json();
    const {
      brand,
      angles,
      leanPercent,
      campaign,
      adGroup,
      userContext = {},
      brandGuidelines = "",
    } = body || {};

    if (!campaign || !adGroup) {
      return NextResponse.json({ error: "campaign and adGroup required", debug }, { status: 400 });
    }

    const lean = typeof leanPercent === "number" ? leanPercent : 50;
    const kwList = (adGroup.keywords || []).map((k: any) => k.text).filter(Boolean);
    const dkiDefault = kwList[0] || (brand?.mustIncludeKeywords?.[0] ?? "Get Started");

    const userContextBlock = [
      userContext.about ? `What the business does: ${userContext.about}` : "",
      userContext.audience ? `Ideal customer: ${userContext.audience}` : "",
      userContext.goals ? `Campaign goal: ${userContext.goals}` : "",
      userContext.notes ? `Other context: ${userContext.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const brandGuidelinesBlock = brandGuidelines.trim()
      ? `\nBRAND GUIDELINES (must follow tone, do/don'ts):\n${brandGuidelines.trim().slice(0, 4000)}\n`
      : "";

    const userText = `Generate Google Ads RSA copy for the ad group below. Submit via submit_rsa_copy.

BRAND
- Tone: ${brand?.toneOfVoice || ""}
- Audience: ${brand?.targetAudience || ""}
- USPs: ${(brand?.usps || []).join("; ")}
- Must-include keywords: ${(brand?.mustIncludeKeywords || []).join(", ")}
${userContextBlock ? `\nUSER-PROVIDED CONTEXT\n${userContextBlock}\n` : ""}${brandGuidelinesBlock}
ANGLE LEAN
- ${lean}% aspiration. ${lean < 40 ? "Favour pain framing." : lean > 60 ? "Favour aspiration framing." : "Balanced."}

CAMPAIGN: ${campaign.name} (${campaign.structure}, ${campaign.channelType})
AD GROUP: ${adGroup.name}
LANDING PATH: ${adGroup.landingPath || "/"}
KEYWORDS: ${kwList.join(", ")}

CHARACTER LIMITS (HARD - count before submitting):
- Headlines: <= 30 chars each (DKI default text counts only)
- Descriptions: <= 90 chars each (this includes spaces; e.g. "Channel-agnostic strategy guided by independent research." = 56 chars OK)
- Display paths: <= 15 chars each
- Sitelinks: text <= 25, desc1/desc2 <= 35 each
If any draft exceeds the limit, shorten it before output. Do NOT pad - shorter is fine.

REQUIREMENTS
- Exactly 15 headlines. Headline 1 = DKI: "{KeyWord:${dkiDefault}}" with pin = 1. Default text <= 30 chars.
- Other 14 headlines: <= 30 chars each. Mix of angles. Most pin = null.
- Exactly 5 descriptions, <= 90 chars each.
- Exactly 2 display paths, <= 15 chars, sentence case, hyphens not spaces.
- Exactly 6 sitelinks (text + desc1 + desc2). EACH sitelink description MUST be a complete thought - a finished phrase or sentence. NEVER end mid-sentence on words like "and", "with", "for", "to", "or", "the", "your", "our". If you can't fit a complete thought in 35 chars, write a SHORTER complete thought instead. Examples of bad sitelinks: "We help with your goals and" (truncated), "Strategy built around your" (cut off). Examples of good sitelinks: "Built around your goals" (23 chars, complete), "Real results, real fast" (23 chars, complete).
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
    let clippedCount = 0;

    // Headlines: post-process + clip
    out.headlines = (out.headlines || []).map((h: any, i: number) => {
      const { isDki, visible } = dkiVisible(h.text);
      let text = h.text;
      let len = visible.length;
      if (!isDki && len > 30) {
        const clipped = smartClip(text, 30);
        clippedCount++;
        text = clipped;
        len = clipped.length;
      }
      return {
        ...h,
        text,
        id: rid("h"),
        length: len,
        overLimit: len > 30,
        isDki,
        index: i + 1,
      };
    });
    if (out.headlines[0]) out.headlines[0].pin = 1;

    // Descriptions: hard-clip to 90 + strip mid-sentence fragments
    out.descriptions = (out.descriptions || []).map((d: any, i: number) => {
      let text = d.text || "";
      if (text.length > 90) {
        text = smartClip(text, 90);
        clippedCount++;
      }
      // Don't strip from descriptions if it ends in a period - that's a real ending
      if (text && !/[.!?]$/.test(text.trim())) {
        const before = text;
        text = stripPartialThought(text);
        if (text !== before) clippedCount++;
      }
      return {
        ...d,
        text,
        id: rid("d"),
        length: text.length,
        overLimit: text.length > 90,
        index: i + 1,
      };
    });

    // Paths: clip to 15
    out.paths = (out.paths || []).map((p: string) => (p && p.length > 15 ? smartClip(p, 15) : p));

    // Sitelinks: clip + strip mid-sentence fragments
    out.sitelinks = (out.sitelinks || []).map((s: any) => {
      let text = s.text && s.text.length > 25 ? smartClip(s.text, 25) : s.text;
      let desc1 = s.desc1 && s.desc1.length > 35 ? smartClip(s.desc1, 35) : s.desc1;
      let desc2 = s.desc2 && s.desc2.length > 35 ? smartClip(s.desc2, 35) : s.desc2;
      // Strip trailing fragment words from descriptions only (text is allowed to be a noun phrase)
      desc1 = stripPartialThought(desc1);
      desc2 = stripPartialThought(desc2);
      return { ...s, text, desc1, desc2, id: rid("sl") };
    });

    debug.clippedCount = clippedCount;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ ...out, debug });
  } catch (err: any) {
    debug.error = err?.message || String(err);
    debug.stack = err?.stack;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ error: debug.error, debug }, { status: 500 });
  }
}
