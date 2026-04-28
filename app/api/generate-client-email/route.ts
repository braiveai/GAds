import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 45;
export const dynamic = "force-dynamic";

const emailTool = {
  name: "submit_client_email",
  description:
    "Submit a client-ready email from an agency rep walking the client through the campaign architecture and inviting feedback. Australian English. No em dashes - use hyphens. Conversational but professional.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Email subject line - punchy, signals what's inside, references the brand or campaign work specifically.",
        maxLength: 80,
      },
      body: {
        type: "string",
        description:
          "The email body in plain text. Greeting, 1 paragraph framing what was built and why, 2-3 short bullets walking through the highest-priority campaigns (mentioning each by short name with the WHY in plain language - not the full campaign name with suffix), the review link prominently, a note inviting feedback, sign-off. ~180-280 words. No subject line in the body. Use double newlines between paragraphs. Australian English. No em dashes.",
        minLength: 400,
      },
    },
    required: ["subject", "body"],
  },
} as const;

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };
  const t0 = Date.now();
  try {
    const body = await req.json();
    const {
      brand,
      strategySummary,
      campaigns = [],
      reviewUrl,
      brandUrl,
      userContext = {},
    } = body || {};

    if (!campaigns.length || !reviewUrl) {
      return NextResponse.json({ error: "campaigns and reviewUrl required", debug }, { status: 400 });
    }

    const campaignsBlock = campaigns
      .slice(0, 8)
      .map((c: any, i: number) => {
        const stage = c.funnelStage ? ` [${c.funnelStage}]` : "";
        return `${i + 1}. ${c.name}${stage}\n   Structure: ${c.structure} (${c.channelType})\n   Daily budget: $${c.budget}\n   Why: ${c.clientRationale || c.aiNote || "—"}`;
      })
      .join("\n\n");

    const userContextBlock = [
      userContext.about ? `What the business does: ${userContext.about}` : "",
      userContext.audience ? `Ideal customer: ${userContext.audience}` : "",
      userContext.goals ? `Campaign goal: ${userContext.goals}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const userText = `You are an experienced Australian media agency account director writing an email to your client. The agency has just built a Google Ads architecture for the client and wants the client to review it. Write the email so the client understands the strategy and feels confident.

CONTEXT
- Brand site: ${brandUrl || "(not provided)"}
- Brand tone: ${brand?.toneOfVoice || ""}
- Audience: ${brand?.targetAudience || ""}
${userContextBlock ? `\n${userContextBlock}` : ""}

STRATEGY SUMMARY (the strategic logic behind the build):
${strategySummary || "(no top-level summary - infer from campaigns below)"}

CAMPAIGNS BUILT:
${campaignsBlock}

REVIEW LINK (must be prominent in the email):
${reviewUrl}

REQUIREMENTS
- Voice: Australian agency, professional but human. Confident not salesy. NOT "thrilled to share" / "excited to deliver" - just clear and direct.
- Open with one sentence framing what was built and why (don't restate the strategy summary verbatim, paraphrase).
- 2-3 short bullets walking the client through the most important campaigns (use short names, not the full "Theme x Sub-theme | SA" naming). Lead with the WHY of each.
- Make the review link prominent and tell the client what to do (click through, leave notes per variation).
- One line inviting questions or a quick call.
- Sign-off generic ("Cheers" or similar - the agency rep will replace with their name).
- ~180-280 words total in the body.
- No em dashes. Australian English. No corporate fluff. No "leveraging" or "synergies".

Submit via submit_client_email.`;

    const claudeStart = Date.now();
    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 2000,
      tools: [emailTool] as any,
      tool_choice: { type: "tool", name: "submit_client_email" } as any,
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

    const out = toolBlock.input as { subject: string; body: string };
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ ...out, debug });
  } catch (err: any) {
    debug.error = err?.message || String(err);
    debug.stack = err?.stack;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ error: debug.error, debug }, { status: 500 });
  }
}
