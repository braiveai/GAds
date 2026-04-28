import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_FAST, MODEL_SMART } from "@/lib/anthropic";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

    // Step 1: Fetch the homepage HTML
    const html = await fetchHtml(url);
    if (!html) return NextResponse.json({ error: "Could not fetch URL" }, { status: 400 });

    // Step 2: Find a few key internal links to crawl as well
    const internalUrls = extractInternalLinks(html, url).slice(0, 4);
    const additionalPages = await Promise.all(
      internalUrls.map(u => fetchHtml(u).then(h => h ? `--- ${u} ---\n${textFromHtml(h).slice(0, 4000)}` : ""))
    );
    const homeText = textFromHtml(html);
    const corpus = [`--- ${url} ---\n${homeText.slice(0, 8000)}`, ...additionalPages.filter(Boolean)].join("\n\n");

    // Step 3: Ask Claude to extract structured brand fingerprint + strategic angles
    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 3500,
      system: `You are an expert media strategist at an independent ad agency in Australia. You extract a brand fingerprint from a website's actual content and identify how Google Ads should lean. Be specific to the brand — never give generic SaaS-style observations. Use Australian English.`,
      messages: [{
        role: "user",
        content: `I scraped these pages from ${url}. Extract the brand fingerprint and propose strategic angles for Google Ads.

${corpus}

Return ONLY valid JSON, no markdown, no preamble. Schema:

{
  "brand": {
    "toneOfVoice": "1-2 sentences. Specific to this brand's actual writing — adjectives the brand uses, register, energy.",
    "targetAudience": "1-2 sentences. WHO they are buying for.",
    "usps": ["3-6 short phrases. Real differentiators surfaced from the copy. No generic claims."],
    "mustIncludeKeywords": ["3-5 lowercase keyword phrases people would search for them, AU spelling"]
  },
  "angles": {
    "pain": [
      {"title": "Short crisp title (5-8 words)", "description": "1 sentence with specific evidence from the site or category."},
      {"title": "...", "description": "..."},
      {"title": "...", "description": "..."}
    ],
    "aspiration": [
      {"title": "Short crisp title (5-8 words)", "description": "1 sentence."},
      {"title": "...", "description": "..."},
      {"title": "...", "description": "..."}
    ]
  },
  "recommendedLean": 35
}

recommendedLean is 0-100 where 0 is all pain-led and 100 is all aspiration-led. Pick what suits the category and brand voice.`
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      url,
      pagesScraped: internalUrls.length + 1,
      ...parsed,
    });
  } catch (err: any) {
    console.error("scrape-brief error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BRAIVEAdsBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function textFromHtml(html: string): string {
  // Remove script and style blocks
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // Strip tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  // Decode common entities
  cleaned = cleaned.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    const matches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of matches) {
      const href = m[1];
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
      let full: string;
      try { full = new URL(href, baseUrl).toString(); } catch { continue; }
      const u = new URL(full);
      if (u.hostname !== base.hostname) continue;
      // Strip query/fragment for dedup, skip likely non-content URLs
      const path = u.pathname.toLowerCase();
      if (path.match(/\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|xml|json)$/)) continue;
      if (path.startsWith("/wp-") || path.startsWith("/admin") || path.startsWith("/cart") || path.startsWith("/checkout") || path.startsWith("/login") || path.startsWith("/account")) continue;
      const key = u.origin + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    // Prefer pages that look like content (about, services, products, etc)
    out.sort((a, b) => {
      const score = (s: string) => {
        const p = new URL(s).pathname.toLowerCase();
        if (p.match(/about|service|product|home|builder|design|range|build|gallery|why/)) return 1;
        return 0;
      };
      return score(b) - score(a);
    });
    return out;
  } catch { return []; }
}
