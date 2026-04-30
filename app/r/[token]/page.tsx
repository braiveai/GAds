"use client";

import { useEffect, useMemo, useState } from "react";

type Headline = { text: string; angle: string; pin: number | null; isDki?: boolean };
type Description = { text: string; angle: string; pin: number | null };
type Sitelink = { text: string; desc1: string; desc2: string };
type Copy = { headlines: Headline[]; descriptions: Description[]; paths: string[]; sitelinks: Sitelink[] };
type Keyword = { text: string; match: string };
type AdGroup = { id: string; name: string; landingPath: string; keywords: Keyword[]; copy?: Copy };
type Campaign = {
  id: string;
  name: string;
  structure: string;
  channelType: string;
  adGroups: AdGroup[];
  accent?: string;
  clientRationale?: string;
  funnelStage?: string;
};
type Session = {
  buildName: string;
  brandName?: string;
  baseUrl: string;
  campaigns: Campaign[];
  strategySummary?: string;
  createdAt: string;
};

/**
 * Angle definitions - pulled from the actual generated copy, not hardcoded.
 * Maps angle keyword -> human label.
 */
const ANGLE_LABEL: Record<string, string> = {
  benefit: "Benefit-led",
  usp: "USP-led",
  urgency: "Urgency-led",
  proof: "Proof-led",
  qualifier: "Qualifier-led",
  cta: "CTA-led",
};

/**
 * Pick the strongest 3 angle variations *present in this copy*.
 * Counts angle frequency across headlines+descriptions and returns the top 3.
 */
function pickAngleVariations(copy: Copy | undefined): string[] {
  if (!copy) return [];
  const counts: Record<string, number> = {};
  for (const h of copy.headlines || []) {
    if (h.angle) counts[h.angle] = (counts[h.angle] || 0) + 1;
  }
  for (const d of copy.descriptions || []) {
    if (d.angle) counts[d.angle] = (counts[d.angle] || 0) + 1;
  }
  // Sort by count desc, then by a sensible default order
  const priority = ["benefit", "usp", "urgency", "proof", "qualifier", "cta"];
  const sorted = Object.keys(counts).sort((a, b) => {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return priority.indexOf(a) - priority.indexOf(b);
  });
  // Always show 3 if we have them; pad from priority order if undercount
  const result = sorted.slice(0, 3);
  for (const p of priority) {
    if (result.length >= 3) break;
    if (!result.includes(p) && counts[p]) result.push(p);
  }
  return result.slice(0, 3);
}

function dkiVisible(t: string) {
  const m = t.match(/^\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}$/);
  return m ? m[1] : t;
}

/**
 * Pick three headlines for a given angle: H1 (DKI/anchor) + 2 from this angle.
 */
function pickHeadlinesForAngle(copy: Copy, angle: string): Headline[] {
  const headlines = copy.headlines || [];
  const result: Headline[] = [];
  if (headlines[0]) result.push(headlines[0]);
  for (const h of headlines) {
    if (result.length >= 3) break;
    if (h.angle === angle && !result.find((r) => r.text === h.text)) result.push(h);
  }
  // If still under 3, fill from any
  for (const h of headlines) {
    if (result.length >= 3) break;
    if (!result.find((r) => r.text === h.text)) result.push(h);
  }
  return result.slice(0, 3);
}

/**
 * Pick TWO descriptions for the SERP preview (Google shows two lines).
 * First the angle-matching one, then any second one.
 */
function pickDescriptionsForAngle(copy: Copy, angle: string): Description[] {
  const descs = copy.descriptions || [];
  const result: Description[] = [];
  const angleMatch = descs.find((d) => d.angle === angle);
  if (angleMatch) result.push(angleMatch);
  for (const d of descs) {
    if (result.length >= 2) break;
    if (!result.find((r) => r.text === d.text)) result.push(d);
  }
  return result.slice(0, 2);
}

function hostFromUrl(u: string) {
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).host.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export default function ClientReviewPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [session, setSession] = useState<Session | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function load() {
      // Try Supabase first
      try {
        const res = await fetch(`/api/reviews/${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.review) {
            const r = data.review;
            const s: Session = {
              buildName: "Architect Build",
              brandName: undefined,
              baseUrl: r.brand_url_snapshot || "",
              campaigns: r.campaigns_snapshot || [],
              strategySummary: r.strategy_summary_snapshot || "",
              createdAt: r.created_at,
            };
            setSession(s);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // Fallback to localStorage
      const raw = localStorage.getItem("braive_review_" + token);
      if (!raw) {
        setMissing(true);
        setLoading(false);
        return;
      }
      try {
        setSession(JSON.parse(raw));
      } catch {
        setMissing(true);
      }
      setLoading(false);
    }

    load();
  }, [token]);

  function toggleCampaignExpanded(id: string) {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return <main className="loading-page"><div>Loading preview...</div></main>;
  }

  if (missing || !session) {
    return (
      <main className="missing">
        <div className="missing-card">
          <h1>Preview not found</h1>
          <p>This preview link could not be loaded. The link may have expired.</p>
        </div>
      </main>
    );
  }

  const host = hostFromUrl(session.baseUrl);

  return (
    <main className="page">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-name">
            <img src="/architect-logo.png" alt="Architect" className="hdr-logo" />
            <div>
              <div className="hdr-build">Campaign preview</div>
              <div className="hdr-sub">{session.brandName || host}</div>
            </div>
          </div>
        </div>
      </header>

      <section className="content">
        <div className="preview-intro">
          <p>This is a preview of your proposed Google Ads campaigns. Reply to your account lead with any feedback or to give the green light.</p>
        </div>

        {session.strategySummary && (
          <div className="strategy">
            <div className="strategy-label">The strategy</div>
            <p>{session.strategySummary}</p>
          </div>
        )}

        {session.campaigns.map((c) => {
          const isExpanded = expandedCampaigns[c.id];
          const firstGroup = c.adGroups[0];
          const firstCopy = firstGroup?.copy;
          const previewAngles = firstCopy ? pickAngleVariations(firstCopy) : [];
          const heroAngle = previewAngles[0] || "benefit";
          const heroHeadlines = firstCopy ? pickHeadlinesForAngle(firstCopy, heroAngle) : [];
          const heroDescs = firstCopy ? pickDescriptionsForAngle(firstCopy, heroAngle) : [];
          const heroPath = firstCopy?.paths?.filter(Boolean).join("/") || "";
          const heroSitelinks = (firstCopy?.sitelinks || []).slice(0, 4);

          return (
            <div key={c.id} className="campaign">
              <div className="campaign-h">
                <div className="campaign-accent" style={{ background: c.accent || "#FF66C3" }} />
                <div className="campaign-meta-l">
                  <div className="campaign-name">{c.name}</div>
                  <div className="campaign-meta">
                    {c.channelType} · {c.structure} · {c.adGroups.length} ad group{c.adGroups.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {c.clientRationale && (
                <div className="rationale">{c.clientRationale}</div>
              )}

              {!isExpanded && firstCopy && (
                <div className="campaign-preview">
                  <div className="serp serp-full">
                    <div className="serp-row1">
                      <div className="serp-fav">{(session.brandName || host).slice(0, 1).toUpperCase()}</div>
                      <div>
                        <div className="serp-spons">Sponsored</div>
                        <div className="serp-host">
                          {host}
                          {heroPath ? <span className="serp-path"> &gt; {heroPath}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="serp-h">{heroHeadlines.map((h) => dkiVisible(h.text)).join(" | ")}</div>
                    {heroDescs.map((d, i) => (
                      <div key={i} className="serp-d-line">{d.text}</div>
                    ))}
                    {heroSitelinks.length > 0 && (
                      <div className="serp-sitelinks">
                        {heroSitelinks.map((s, i) => (
                          <div key={i} className="serp-sitelink">
                            <div className="serp-sitelink-text">{s.text}</div>
                            {(s.desc1 || s.desc2) && (
                              <div className="serp-sitelink-desc">{[s.desc1, s.desc2].filter(Boolean).join(" · ")}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="campaign-preview-note">
                    Preview from <strong>{firstGroup?.name}</strong>. Expand to see all {c.adGroups.length} ad group{c.adGroups.length === 1 ? "" : "s"} and angle variations.
                  </div>
                </div>
              )}

              <div className="campaign-actions">
                <button className="btn ghost" onClick={() => toggleCampaignExpanded(c.id)}>
                  {isExpanded ? "Collapse" : "Show all variations"}
                </button>
              </div>

              {isExpanded && (
                <div className="adgroups">
                  {c.adGroups.map((g) => {
                    const copy = g.copy;
                    if (!copy) {
                      return (
                        <div key={g.id} className="adgroup">
                          <div className="adgroup-name">{g.name}</div>
                          <div className="empty">Copy not generated yet for this ad group.</div>
                        </div>
                      );
                    }
                    const angles = pickAngleVariations(copy);
                    return (
                      <div key={g.id} className="adgroup">
                        <div className="adgroup-h">
                          <div className="adgroup-name">{g.name}</div>
                          <div className="adgroup-meta">{g.landingPath}</div>
                        </div>
                        <div className="variations">
                          {angles.map((angle) => {
                            const headlines = pickHeadlinesForAngle(copy, angle);
                            const descs = pickDescriptionsForAngle(copy, angle);
                            const path1 = copy.paths?.[0] || "";
                            const path2 = copy.paths?.[1] || "";
                            const pathDisplay = [path1, path2].filter(Boolean).join("/");
                            const sitelinks = (copy.sitelinks || []).slice(0, 4);

                            return (
                              <div key={angle} className="variation">
                                <div className="variation-tag">{ANGLE_LABEL[angle] || angle}</div>
                                <div className="serp serp-full">
                                  <div className="serp-row1">
                                    <div className="serp-fav">{(session.brandName || host).slice(0, 1).toUpperCase()}</div>
                                    <div>
                                      <div className="serp-spons">Sponsored</div>
                                      <div className="serp-host">
                                        {host}
                                        {pathDisplay ? <span className="serp-path"> &gt; {pathDisplay}</span> : null}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="serp-h">{headlines.map((h) => dkiVisible(h.text)).join(" | ")}</div>
                                  {descs.map((d, i) => (
                                    <div key={i} className="serp-d-line">{d.text}</div>
                                  ))}
                                  {sitelinks.length > 0 && (
                                    <div className="serp-sitelinks">
                                      {sitelinks.map((s, i) => (
                                        <div key={i} className="serp-sitelink">
                                          <div className="serp-sitelink-text">{s.text}</div>
                                          {(s.desc1 || s.desc2) && (
                                            <div className="serp-sitelink-desc">{[s.desc1, s.desc2].filter(Boolean).join(" · ")}</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <footer className="footer">
          <p>Created on {new Date(session.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.</p>
          <p className="footer-brand">Powered by <strong>Architect</strong>, a BRAIVE product.</p>
        </footer>
      </section>

      <style jsx>{`
        :global(html, body) { margin: 0; padding: 0; }
        :global(body) { background: #E8E7DF; font-family: "Manrope", ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0A0A0A; }
        .loading-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #666; font-size: 14px; }
        .missing { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .missing-card { max-width: 480px; padding: 32px; background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 12px; text-align: center; }
        .missing h1 { font-size: 20px; margin: 0 0 8px; font-weight: 700; }
        .missing p { font-size: 14px; color: #666; margin: 0; line-height: 1.5; }
        .page { min-height: 100vh; padding-bottom: 80px; }
        .hdr { background: white; border-bottom: 0.5px solid rgba(0,0,0,0.08); }
        .hdr-inner { max-width: 1080px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .hdr-name { display: flex; align-items: center; gap: 12px; }
        .hdr-logo { height: 40px; width: auto; mix-blend-mode: multiply; }
        .hdr-build { font-size: 11px; color: #666; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
        .hdr-sub { font-size: 15px; font-weight: 700; color: #0A0A0A; }
        .content { max-width: 1080px; margin: 0 auto; padding: 28px 24px; }
        .preview-intro { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; }
        .preview-intro p { margin: 0; font-size: 13.5px; color: #1A1A1A; line-height: 1.55; }
        .strategy { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-left: 3px solid #FF66C3; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
        .strategy-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #E64FAB; font-weight: 700; margin-bottom: 6px; }
        .strategy p { margin: 0; font-size: 14px; line-height: 1.6; color: #1A1A1A; }
        .campaign { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
        .campaign-h { display: flex; align-items: flex-start; gap: 12px; }
        .campaign-accent { width: 4px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
        .campaign-meta-l { flex: 1; min-width: 0; }
        .campaign-name { font-size: 16px; font-weight: 700; color: #0A0A0A; margin-bottom: 4px; letter-spacing: -0.01em; }
        .campaign-meta { font-size: 11.5px; color: #666; }
        .rationale { margin: 12px 0 0; padding: 10px 14px; background: rgba(255,102,195,0.06); border-radius: 6px; font-size: 12.5px; color: #1A1A1A; line-height: 1.55; border-left: 2px solid #FF66C3; }
        .campaign-preview { margin: 14px 0 0; }
        .campaign-preview-note { margin-top: 10px; font-size: 11px; color: #888; font-style: italic; }
        .campaign-actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
        .adgroups { margin-top: 18px; padding-top: 18px; border-top: 0.5px solid rgba(0,0,0,0.06); }
        .adgroup { margin-bottom: 22px; }
        .adgroup-h { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 0.5px dashed rgba(0,0,0,0.06); }
        .adgroup-name { font-size: 13.5px; font-weight: 700; color: #0A0A0A; }
        .adgroup-meta { font-size: 11px; color: #888; font-family: ui-monospace, SFMono-Regular, monospace; padding: 1px 8px; background: rgba(255,102,195,0.08); border-radius: 3px; color: #E64FAB; }
        .empty { font-size: 12px; color: #888; font-style: italic; padding: 12px; background: #F4F3EF; border-radius: 6px; }
        .variations { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .variation { background: #FAFAF7; border: 0.5px solid rgba(0,0,0,0.06); border-radius: 8px; padding: 14px; }
        .variation-tag { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; font-weight: 600; margin-bottom: 10px; }
        .serp { background: white; border: 0.5px solid rgba(0,0,0,0.06); border-radius: 6px; padding: 13px 15px; }
        .serp-full { box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .serp-row1 { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
        .serp-fav { width: 18px; height: 18px; background: #FF66C3; color: white; font-size: 10px; font-weight: 700; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .serp-spons { font-size: 10px; color: #444; font-weight: 500; }
        .serp-host { font-size: 11px; color: #444; }
        .serp-path { color: #888; }
        .serp-h { font-size: 16px; color: #1a0dab; line-height: 1.3; margin: 6px 0 6px; font-family: arial, sans-serif; }
        .serp-d-line { font-size: 12px; color: #4d5156; line-height: 1.5; font-family: arial, sans-serif; }
        .serp-d-line + .serp-d-line { margin-top: 2px; }
        .serp-sitelinks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-top: 12px; padding-top: 10px; border-top: 0.5px solid rgba(0,0,0,0.05); }
        .serp-sitelink-text { font-size: 12.5px; color: #1a0dab; font-family: arial, sans-serif; line-height: 1.3; }
        .serp-sitelink-desc { font-size: 10.5px; color: #4d5156; line-height: 1.4; margin-top: 1px; font-family: arial, sans-serif; }
        .btn { padding: 7px 14px; border-radius: 6px; border: 0.5px solid rgba(0,0,0,0.16); background: white; color: #0A0A0A; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.08s; }
        .btn.ghost { background: transparent; }
        .btn.ghost:hover { background: rgba(0,0,0,0.04); }
        .footer { margin-top: 36px; padding-top: 18px; border-top: 0.5px solid rgba(0,0,0,0.06); text-align: center; font-size: 11.5px; color: #888; }
        .footer p { margin: 4px 0; }
        .footer-brand strong { color: #0A0A0A; }
        @media (max-width: 720px) {
          .variations { grid-template-columns: 1fr; }
          .serp-sitelinks { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
