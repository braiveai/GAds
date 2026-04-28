import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HEADER_FILL = "FF1F1F2E"; // dark navy
const HEADER_FONT = "FFFFFFFF"; // white
const PIN_FILL = "FFFBE9DD";    // soft peach
const ZEBRA_FILL = "FFF6F6F8";

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: "Geist", color: { argb: HEADER_FONT }, bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });
}

function pinCellFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PIN_FILL } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function setCol(ws: ExcelJS.Worksheet, key: string, width: number) {
  const col = ws.getColumn(key);
  if (col) col.width = width;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaigns: any[] = body?.campaigns || [];
    const buildName: string = body?.buildName || "BRAIVE Ads Build";
    const baseUrl: string = body?.baseUrl || "";

    if (!campaigns.length) {
      return NextResponse.json({ error: "campaigns required" }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "BRAIVE Ads";
    wb.created = new Date();

    // ============ Sheet 1: MKAG STRUCTURE ============
    const s1 = wb.addWorksheet("MKAG STRUCTURE", { views: [{ state: "frozen", ySplit: 1 }] });
    s1.columns = [
      { header: "AD GROUP", key: "ag", width: 36 },
      { header: "CAMPAIGN", key: "c", width: 36 },
      { header: "Criterion Type", key: "ct", width: 14 },
      { header: "CAMPAIGN THEME", key: "ctheme", width: 22 },
      { header: "AD GROUP THEME", key: "agtheme", width: 22 },
      { header: "KEYWORD", key: "kw", width: 36 },
    ];
    styleHeaderRow(s1.getRow(1));

    let rowZebra = false;
    for (const c of campaigns) {
      const themeMatch = (c.name || "").split(" x ");
      const cTheme = (themeMatch[0] || "").trim();
      const cName = c.name || "";
      for (const g of c.adGroups || []) {
        const agTheme = (g.name || "").split(" | ")[0]?.trim() || g.name || "";
        for (const k of g.keywords || []) {
          const matchLabel =
            k.match === "PHR" ? "Phrase" : k.match === "EXC" ? "Exact" : k.match === "BRD" ? "Broad" : "Phrase";
          const r = s1.addRow({
            ag: g.name,
            c: cName,
            ct: matchLabel,
            ctheme: cTheme,
            agtheme: agTheme,
            kw: k.text,
          });
          if (rowZebra) {
            r.eachCell((cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
            });
          }
          rowZebra = !rowZebra;
        }
      }
    }

    // ============ Sheet 2: RSA AD COPY ============
    const s2 = wb.addWorksheet("RSA AD COPY", { views: [{ state: "frozen", ySplit: 1 }] });
    // Build header dynamically
    const rsaHeaders: string[] = ["CAMPAIGN", "AD GROUP", "H1 (DKI)", "H1 LEN", "H1 PIN"];
    for (let i = 2; i <= 15; i++) {
      rsaHeaders.push(`H${i}`, `H${i} LEN`, `H${i} PIN`);
    }
    for (let i = 1; i <= 5; i++) {
      rsaHeaders.push(`D${i}`, `D${i} LEN`);
    }
    rsaHeaders.push("P1", "P2", "FINAL URL");
    s2.addRow(rsaHeaders);
    styleHeaderRow(s2.getRow(1));

    // column widths
    s2.getColumn(1).width = 30; // campaign
    s2.getColumn(2).width = 28; // ad group
    // Headlines: text col 30, len col 7, pin col 6
    let colIdx = 3;
    for (let i = 1; i <= 15; i++) {
      s2.getColumn(colIdx).width = 28;     // text
      s2.getColumn(colIdx + 1).width = 7;  // len
      s2.getColumn(colIdx + 2).width = 6;  // pin
      colIdx += 3;
    }
    // Descriptions: text 40, len 7
    for (let i = 1; i <= 5; i++) {
      s2.getColumn(colIdx).width = 40;
      s2.getColumn(colIdx + 1).width = 7;
      colIdx += 2;
    }
    s2.getColumn(colIdx).width = 16;     // P1
    s2.getColumn(colIdx + 1).width = 16; // P2
    s2.getColumn(colIdx + 2).width = 50; // Final URL

    // Data rows: one per ad group that has copy; if no copy, still write a placeholder row
    for (const c of campaigns) {
      for (const g of c.adGroups || []) {
        const copy = g.copy;
        const rowVals: any[] = [c.name, g.name];
        const r = s2.addRow([]);
        const rowNum = r.number;
        // Helper for letter
        const addrAt = (col: number, row: number) => {
          let s = "";
          let n = col;
          while (n > 0) {
            const m = (n - 1) % 26;
            s = String.fromCharCode(65 + m) + s;
            n = Math.floor((n - 1) / 26);
          }
          return `${s}${row}`;
        };
        // Write campaign + ad group
        r.getCell(1).value = c.name;
        r.getCell(2).value = g.name;

        // 15 headlines
        let writeCol = 3;
        for (let i = 0; i < 15; i++) {
          const h = copy?.headlines?.[i];
          const textCell = r.getCell(writeCol);
          const lenCell = r.getCell(writeCol + 1);
          const pinCell = r.getCell(writeCol + 2);
          if (h?.text) {
            textCell.value = h.text;
            const textAddr = addrAt(writeCol, rowNum);
            // H1 is DKI -> -9; others raw
            if (i === 0) {
              lenCell.value = { formula: `LEN(${textAddr})-9` } as any;
            } else {
              lenCell.value = { formula: `LEN(${textAddr})` } as any;
            }
            if (h.pin != null) {
              pinCell.value = h.pin;
              pinCellFill(pinCell);
            }
          }
          writeCol += 3;
        }
        // 5 descriptions
        for (let i = 0; i < 5; i++) {
          const d = copy?.descriptions?.[i];
          const textCell = r.getCell(writeCol);
          const lenCell = r.getCell(writeCol + 1);
          if (d?.text) {
            textCell.value = d.text;
            lenCell.value = { formula: `LEN(${addrAt(writeCol, rowNum)})` } as any;
          }
          writeCol += 2;
        }
        // P1, P2
        r.getCell(writeCol).value = copy?.paths?.[0] || "";
        r.getCell(writeCol + 1).value = copy?.paths?.[1] || "";
        // Final URL
        r.getCell(writeCol + 2).value = baseUrl ? safeUrl(baseUrl, g.landingPath || "/") : g.landingPath || "";

        // length cell numeric formats / over-limit shading
        // (lenCell holds a formula; conditional formatting via formula colours not applied here for compatibility)
      }
    }

    // ============ Sheet 3: Performance Max Builder (conditional) ============
    const pmaxCampaigns = campaigns.filter((c) => (c.channelType || "").toLowerCase() === "pmax");
    if (pmaxCampaigns.length) {
      const s3 = wb.addWorksheet("Performance Max Builder", { views: [{ state: "frozen", ySplit: 1 }] });
      s3.columns = [
        { header: "CAMPAIGN", key: "c", width: 32 },
        { header: "ASSET TYPE", key: "type", width: 22 },
        { header: "ASSET", key: "asset", width: 60 },
        { header: "LEN", key: "len", width: 8 },
        { header: "NOTES", key: "notes", width: 40 },
      ];
      styleHeaderRow(s3.getRow(1));

      for (const c of pmaxCampaigns) {
        // Collect all headlines under 30 from ad groups
        const shortHeadlines = new Set<string>();
        const longHeadlines = new Set<string>();
        for (const g of c.adGroups || []) {
          for (const h of g.copy?.headlines || []) {
            if (!h.text) continue;
            const visible = h.text.match(/^\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}$/)?.[1] ?? h.text;
            if (visible.length <= 30) shortHeadlines.add(visible);
          }
          for (const d of g.copy?.descriptions || []) {
            if (!d.text) continue;
            if (d.text.length <= 90) longHeadlines.add(d.text);
          }
        }

        let firstRow = true;
        const writeAsset = (type: string, asset: string, notes: string) => {
          const r = s3.addRow({
            c: firstRow ? c.name : "",
            type,
            asset,
            len: asset.length,
            notes,
          });
          firstRow = false;
          if (type === "Audience signal") {
            r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F6EF" } };
          }
        };

        for (const h of Array.from(shortHeadlines).slice(0, 15)) {
          writeAsset("Short headline (<=30)", h, "");
        }
        for (const lh of Array.from(longHeadlines).slice(0, 5)) {
          writeAsset("Long headline (<=90)", lh, "");
        }
        for (const a of c.audiences || []) {
          writeAsset("Audience signal", a, "");
        }
        // Spacer row
        s3.addRow([]);
      }
    }

    // ============ Build buffer ============
    const buf = await wb.xlsx.writeBuffer();
    const filename = `${slug(buildName)}-${Date.now()}.xlsx`;

    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err), stack: err?.stack }, { status: 500 });
  }
}
