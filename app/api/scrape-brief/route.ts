import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_SMART } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15000;

const briefTool = {
  name: "submit_brand_brief",
  description:
    "Submit the extracted brand fingerprint and strategic angles for this site, suitable as the foundation for a Google Ads brief. Use Australian English. Avoid em dashes; use hyphens.",
  input_schema: {
    type: "object",
    properties: {
      brand: {
        type: "object",
        properties: {
          toneOfVoice: {
            type: "string",
            description: "One short sentence describing the tone of voice on the site.",
          },
          targetAudience: {
            type: "string",
            description: "One sentence describing the most likely target audience.",
          },
          usps: {
            type: "array",
            description: "3 to 6 unique selling points or differentiators visible on the site.",
            items: { type: "string" },
            minItems: 3,
            maxItems: 6,
          },
          mustIncludeKeywords: {
            type: "array",
            description: "3 to 8 brand or category keywords that should appear in ad copy.",
            items: { type: "string" },
            minItems: 3,
            maxItems: 8,
          },
        },
        required: ["toneOfVoice", "targetAudience", "usps", "mustIncludeKeywords"],
      },
      angles: {
        type: "object",
        properties: {
          pain: {
            type: "array",
            description: "Exactly 3 pain-point angles (problems the audience faces that this brand solves).",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                desc: { type: "string" },
              },
              required: ["title", "desc"],
            },
            minItems: 3,
            maxItems: 3,
          },
          aspiration: {
            type: "array",
            description: "Exactly 3 aspiration angles (positive outcomes the audience wants).",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                desc: { type: "string" },
              },
              required: ["title", "desc"],
            },
            minItems: 3,
            maxItems: 3,
          },
        },
        required: ["pain", "aspiration"],
      },
      recommendedLean: {
        type: "integer",
        description: "0 = full pain lean, 100 = full aspiration lean. Recommend based on category convention.",
        minimum: 0,
        maximum: 100,
      },
    },
    required: ["brand", "angles", "recommendedLean"],
  },
} as const;

function normaliseUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function fetchWithBrowserUA(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
    const elapsedMs = Date.now() - start;
    const html = await res.text();
    return {
      url,
      finalUrl: res.url,
      status: res.status,
      ok: res.ok,
      elapsedMs,
      html,
      contentType: res.headers.get("content-type") || "",
    };
  } catch (err: any) {
    return {
      url,
      finalUrl: url,
      status: 0,
      ok: false,
      elapsedMs: Date.now() - start,
      html: "",
      contentType: "",
      error: err?.name === "AbortError" ? `timeout after ${FETCH_TIMEOUT_MS}ms` : (err?.message || String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInternalLinks(html: string, baseUrl: string, max = 4): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, base.href);
    } catch {
      continue;
    }
    if (resolved.host !== base.host) continue;
    // skip files
    if (/\.(png|jpe?g|svg|webp|gif|pdf|zip|mp4|mov|css|js|ico|woff2?)(\?|$)/i.test(resolved.pathname)) continue;
    const clean = resolved.origin + resolved.pathname;
    if (clean === base.origin + base.pathname) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

/** Try to discover URLs from sitemap.xml (best effort). */
async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const collected = new Set<string>();
  for (const sitemapUrl of candidates) {
    try {
      const res = await fetchWithBrowserUA(sitemapUrl);
      if (!res.ok || !res.html) continue;
      // Pull <loc>...</loc> entries
      const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
      let m: RegExpExecArray | null;
      const subSitemaps: string[] = [];
      while ((m = locRe.exec(res.html)) !== null) {
        const u = m[1].trim();
        if (!u) continue;
        if (u.endsWith(".xml")) {
          subSitemaps.push(u);
        } else {
          collected.add(u);
        }
        if (collected.size > 200) break;
      }
      // Follow up to 3 sub-sitemaps
      for (const sub of subSitemaps.slice(0, 3)) {
        try {
          const subRes = await fetchWithBrowserUA(sub);
          if (!subRes.ok || !subRes.html) continue;
          let mm: RegExpExecArray | null;
          const subRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
          while ((mm = subRe.exec(subRes.html)) !== null) {
            const u = mm[1].trim();
            if (u && !u.endsWith(".xml")) collected.add(u);
            if (collected.size > 200) break;
          }
        } catch {}
        if (collected.size > 200) break;
      }
      if (collected.size > 0) break; // first sitemap that worked
    } catch {}
  }
  return Array.from(collected);
}

function dedupeAndCleanUrls(urls: string[], baseHost: string): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (parsed.host !== baseHost) continue;
      if (/\.(png|jpe?g|svg|webp|gif|pdf|zip|mp4|mov|css|js|ico|woff2?|xml|txt)(\?|$)/i.test(parsed.pathname)) continue;
      // strip trailing slash unless it's root
      const path = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/$/, "");
      out.add(parsed.origin + path);
    } catch {}
  }
  return Array.from(out);
}

export async function POST(req: NextRequest) {
  const debug: any = { steps: [], timings: {} };
  const t0 = Date.now();

  try {
    const body = await req.json();
    const rawUrl: string = body?.url || "";
    if (!rawUrl) {
      return NextResponse.json({ error: "url required", debug }, { status: 400 });
    }
    const url = normaliseUrl(rawUrl);
    debug.url = url;
    debug.steps.push("normalised url");

    // 1) fetch homepage
    const home = await fetchWithBrowserUA(url);
    debug.home = {
      status: home.status,
      ok: home.ok,
      finalUrl: home.finalUrl,
      elapsedMs: home.elapsedMs,
      contentType: home.contentType,
      htmlLength: home.html.length,
      error: (home as any).error,
    };
    debug.steps.push("fetched homepage");
    if (!home.ok || !home.html) {
      return NextResponse.json(
        {
          error: `Homepage fetch failed: ${(home as any).error || `HTTP ${home.status}`}`,
          debug,
        },
        { status: 502 }
      );
    }

    // 2) discover up to 4 internal pages for AI corpus
    const internalLinks = extractInternalLinks(home.html, home.finalUrl || url, 4);
    debug.internalLinks = internalLinks;
    debug.steps.push(`found ${internalLinks.length} internal links for corpus`);

    // 2b) parallel: discover broader page list (sitemap + more homepage links)
    const baseHostname = new URL(home.finalUrl || url).host;
    const baseOrigin = new URL(home.finalUrl || url).origin;
    const broaderLinks = extractInternalLinks(home.html, home.finalUrl || url, 80);
    const sitemapUrls = await fetchSitemapUrls(baseOrigin).catch(() => [] as string[]);
    debug.sitemapCount = sitemapUrls.length;
    const allDiscovered = dedupeAndCleanUrls([home.finalUrl || url, ...internalLinks, ...broaderLinks, ...sitemapUrls], baseHostname);
    debug.steps.push(`discovered ${allDiscovered.length} pages total (sitemap: ${sitemapUrls.length})`);

    // 3) fetch internal pages in parallel for AI corpus
    const innerResults = await Promise.all(internalLinks.map((u) => fetchWithBrowserUA(u)));
    debug.innerFetches = innerResults.map((r) => ({
      url: r.url,
      status: r.status,
      ok: r.ok,
      elapsedMs: r.elapsedMs,
      htmlLength: r.html.length,
      error: (r as any).error,
    }));
    debug.steps.push("fetched internal pages");

    // 4) build text corpus
    const homeText = htmlToText(home.html).slice(0, 8000);
    const innerTexts = innerResults
      .filter((r) => r.ok && r.html)
      .map((r) => `--- ${r.finalUrl} ---\n${htmlToText(r.html).slice(0, 4000)}`)
      .join("\n\n");
    const corpus = `URL: ${url}\n\nHOMEPAGE:\n${homeText}\n\nINNER PAGES:\n${innerTexts}`;
    debug.corpusLength = corpus.length;
    debug.steps.push(`built corpus (${corpus.length} chars)`);

    // 5) extract brief via tool_use
    const claudeStart = Date.now();
    const msg = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 4000,
      tools: [briefTool] as any,
      tool_choice: { type: "tool", name: "submit_brand_brief" } as any,
      messages: [
        {
          role: "user",
          content: `You are a senior performance media strategist preparing a Google Ads brief for the brand below. Extract the brand fingerprint and 6 angles (3 pain, 3 aspiration). Use Australian English. Avoid em dashes — use hyphens or rewrite. Submit via the submit_brand_brief tool.\n\nSCRAPED CONTENT:\n${corpus}`,
        },
      ],
    });
    const claudeMs = Date.now() - claudeStart;
    debug.claudeMs = claudeMs;
    debug.usage = msg.usage;
    debug.stopReason = msg.stop_reason;
    debug.steps.push("called Claude with tool_use");

    const toolBlock = msg.content.find((b: any) => b.type === "tool_use") as any;
    if (!toolBlock || !toolBlock.input) {
      debug.rawContent = msg.content;
      return NextResponse.json(
        { error: "Claude did not return a tool_use block", debug },
        { status: 502 }
      );
    }

    const brief = toolBlock.input;
    debug.steps.push("got tool_use input");

    const scrapedSet = new Set<string>([home.finalUrl || url, ...innerResults.filter((r) => r.ok).map((r) => r.finalUrl || r.url)]);
    const discoveredPages = allDiscovered
      .map((u) => {
        try {
          const path = new URL(u).pathname;
          return { url: u, path, scraped: scrapedSet.has(u) };
        } catch {
          return null;
        }
      })
      .filter((x): x is { url: string; path: string; scraped: boolean } => !!x)
      .sort((a, b) => {
        // Root first, then alphabetical
        if (a.path === "/") return -1;
        if (b.path === "/") return 1;
        return a.path.localeCompare(b.path);
      });

    return NextResponse.json({
      url,
      brief,
      pagesScraped: 1 + innerResults.filter((r) => r.ok).length,
      discoveredPages,
      debug: { ...debug, totalElapsedMs: Date.now() - t0 },
    });
  } catch (err: any) {
    debug.error = err?.message || String(err);
    debug.stack = err?.stack;
    debug.totalElapsedMs = Date.now() - t0;
    return NextResponse.json({ error: debug.error, debug }, { status: 500 });
  }
}
