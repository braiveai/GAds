import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function csvCell(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: any[]): string {
  return cells.map(csvCell).join(",");
}

function slug(s: string) {
  return (s || "build").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function safeUrl(base: string, path: string) {
  try {
    const b = new URL(base.startsWith("http") ? base : `https://${base}`);
    const p = path && path !== "/" ? path : "/";
    return new URL(p, b.origin).toString();
  } catch {
    return base;
  }
}

const matchLabel = (m: string) =>
  m === "PHR" ? "Phrase" : m === "EXC" ? "Exact" : m === "BRD" ? "Broad" : "Phrase";

// Headers — Google Ads Editor compatible columns. Editor is forgiving with column ordering;
// we keep the most common minimum set so pasting works.
const HEADER = [
  "Campaign",
  "Ad group",
  "Keyword",
  "Criterion Type",
  "Headline 1", "Headline 1 position",
  "Headline 2", "Headline 2 position",
  "Headline 3", "Headline 3 position",
  "Headline 4", "Headline 4 position",
  "Headline 5", "Headline 5 position",
  "Headline 6", "Headline 6 position",
  "Headline 7", "Headline 7 position",
  "Headline 8", "Headline 8 position",
  "Headline 9", "Headline 9 position",
  "Headline 10", "Headline 10 position",
  "Headline 11", "Headline 11 position",
  "Headline 12", "Headline 12 position",
  "Headline 13", "Headline 13 position",
  "Headline 14", "Headline 14 position",
  "Headline 15", "Headline 15 position",
  "Description 1",
  "Description 2",
  "Description 3",
  "Description 4",
  "Description 5",
  "Path 1",
  "Path 2",
  "Final URL",
  "Status",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaigns: any[] = body?.campaigns || [];
    const buildName: string = body?.buildName || "BRAIVE Ads Build";
    const baseUrl: string = body?.baseUrl || "";

    if (!campaigns.length) {
      return NextResponse.json({ error: "campaigns required" }, { status: 400 });
    }

    const lines: string[] = [row(HEADER)];

    for (const c of campaigns) {
      for (const g of c.adGroups || []) {
        const finalUrl = baseUrl ? safeUrl(baseUrl, g.landingPath || "/") : g.landingPath || "";

        // 1) keyword rows
        for (const k of g.keywords || []) {
          const cells: any[] = new Array(HEADER.length).fill("");
          cells[0] = c.name;
          cells[1] = g.name;
          cells[2] = k.text;
          cells[3] = matchLabel(k.match);
          cells[HEADER.length - 2] = finalUrl;
          cells[HEADER.length - 1] = "Enabled";
          lines.push(row(cells));
        }

        // 2) RSA row (if copy exists)
        const copy = g.copy;
        if (copy?.headlines?.length) {
          const cells: any[] = new Array(HEADER.length).fill("");
          cells[0] = c.name;
          cells[1] = g.name;
          // keyword cols (2,3) blank for RSA rows
          // Headlines start at index 4
          for (let i = 0; i < 15; i++) {
            const h = copy.headlines[i];
            const hStart = 4 + i * 2;
            cells[hStart] = h?.text || "";
            cells[hStart + 1] = h?.pin != null ? h.pin : "";
          }
          // Descriptions start at index 4 + 30 = 34
          const dStart = 34;
          for (let i = 0; i < 5; i++) {
            cells[dStart + i] = copy.descriptions?.[i]?.text || "";
          }
          cells[dStart + 5] = copy.paths?.[0] || "";
          cells[dStart + 6] = copy.paths?.[1] || "";
          cells[dStart + 7] = finalUrl;
          cells[dStart + 8] = "Enabled";
          lines.push(row(cells));
        }
      }
    }

    const csv = lines.join("\r\n");
    const filename = `${slug(buildName)}-${Date.now()}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err), stack: err?.stack }, { status: 500 });
  }
}
