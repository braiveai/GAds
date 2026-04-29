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

type Feedback = Record<string, { status: "approved" | "comment"; note?: string }>;

const ANGLE_GROUPS: { key: string; label: string; pick: (h: Headline) => boolean; pickD: (d: Description) => boolean }[] = [
  {
    key: "benefit",
    label: "Benefit-led",
    pick: (h) => h.angle === "benefit" || h.angle === "proof",
    pickD: (d) => d.angle === "benefit" || d.angle === "proof",
  },
  {
    key: "usp",
    label: "USP-led",
    pick: (h) => h.angle === "usp" || h.angle === "qualifier",
    pickD: (d) => d.angle === "usp" || d.angle === "qualifier",
  },
  {
    key: "urgency",
    label: "Urgency-led",
    pick: (h) => h.angle === "urgency" || h.angle === "cta",
    pickD: (d) => d.angle === "urgency" || d.angle === "cta",
  },
];

function dkiVisible(t: string) {
  const m = t.match(/^\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}$/);
  return m ? m[1] : t;
}

function pickThree(headlines: Headline[], filter: (h: Headline) => boolean): Headline[] {
  const matched = headlines.filter(filter);
  const result: Headline[] = [];
  if (headlines[0]) result.push(headlines[0]);
  for (const h of matched) {
    if (result.length >= 3) break;
    if (!result.find((r) => r.text === h.text)) result.push(h);
  }
  for (const h of headlines) {
    if (result.length >= 3) break;
    if (!result.find((r) => r.text === h.text)) result.push(h);
  }
  return result.slice(0, 3);
}

function pickOneDesc(descs: Description[], filter: (d: Description) => boolean): Description | undefined {
  return descs.find(filter) || descs[0];
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
  const [feedback, setFeedback] = useState<Feedback>({});
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);

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
            if (r.general_feedback) setGeneralFeedback(r.general_feedback);
            // Hydrate feedback from approvals
            const fb: Feedback = {};
            for (const a of (data.approvals || [])) {
              if (a.scope === "variation" && a.scope_id) {
                fb[a.scope_id] = { status: a.status === "approved" ? "approved" : "comment", note: a.note_text || undefined };
              } else if (a.scope === "campaign" && a.scope_id) {
                fb[`campaign_${a.scope_id}`] = { status: a.status === "approved" ? "approved" : "comment", note: a.note_text || undefined };
              } else if (a.scope === "build") {
                fb[`build`] = { status: a.status === "approved" ? "approved" : "comment", note: a.note_text || undefined };
              }
            }
            setFeedback(fb);
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
      const fbRaw = localStorage.getItem("braive_review_fb_" + token);
      if (fbRaw) {
        try {
          setFeedback(JSON.parse(fbRaw));
        } catch {}
      }
      setLoading(false);
    }

    load();
  }, [token]);

  /* Persist feedback locally + best-effort to Supabase */
  function persistLocal(next: Feedback) {
    setFeedback(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("braive_review_fb_" + token, JSON.stringify(next));
    }
  }

  async function postAction(payload: { scope: string; scope_id?: string; status: "approved" | "note" | "reset"; note_text?: string; general_feedback?: string }) {
    try {
      await fetch(`/api/reviews/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  }

  function approveVariation(variationKey: string) {
    persistLocal({ ...feedback, [variationKey]: { status: "approved" } });
    postAction({ scope: "variation", scope_id: variationKey, status: "approved" });
  }

  function noteVariation(variationKey: string, note: string) {
    persistLocal({ ...feedback, [variationKey]: { status: "comment", note } });
    if (note.trim()) postAction({ scope: "variation", scope_id: variationKey, status: "note", note_text: note });
  }

  function approveCampaign(campaign: Campaign) {
    const next: Feedback = { ...feedback };
    for (const g of campaign.adGroups) {
      for (const ag of ANGLE_GROUPS) {
        next[`${g.id}__${ag.key}`] = { status: "approved" };
      }
    }
    next[`campaign_${campaign.id}`] = { status: "approved" };
    persistLocal(next);
    postAction({ scope: "campaign", scope_id: campaign.id, status: "approved" });
  }

  function approveAll() {
    if (!session) return;
    const next: Feedback = { ...feedback };
    for (const c of session.campaigns) {
      for (const g of c.adGroups) {
        for (const ag of ANGLE_GROUPS) {
          next[`${g.id}__${ag.key}`] = { status: "approved" };
        }
      }
      next[`campaign_${c.id}`] = { status: "approved" };
    }
    next[`build`] = { status: "approved" };
    persistLocal(next);
    postAction({ scope: "build", status: "approved" });
  }

  function persistGeneralFeedback(value: string) {
    setGeneralFeedback(value);
    setSavingNote(true);
    postAction({ scope: "build", scope_id: "general", status: "note", note_text: value, general_feedback: value }).finally(() => {
      setTimeout(() => setSavingNote(false), 600);
    });
  }

  function toggleCampaignExpanded(id: string) {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return (
      <main className="loading-page">
        <div>Loading review...</div>
      </main>
    );
  }

  if (missing || !session) {
    return (
      <main className="missing">
        <div className="missing-card">
          <h1>Review link not found</h1>
          <p>This review session could not be loaded. The link may have expired.</p>
        </div>
      </main>
    );
  }

  const host = hostFromUrl(session.baseUrl);

  // Stats
  const totalVariations = session.campaigns.reduce((sum, c) => sum + (c.adGroups?.length || 0) * 3, 0);
  const approvedVariations = Object.entries(feedback).filter(([k, f]) => !k.startsWith("campaign_") && k !== "build" && f.status === "approved").length;
  const noteCount = Object.entries(feedback).filter(([k, f]) => !k.startsWith("campaign_") && k !== "build" && f.status === "comment" && f.note && f.note.trim()).length;
  const allApproved = totalVariations > 0 && approvedVariations >= totalVariations;
  const buildApproved = feedback.build?.status === "approved";

  return (
    <main className="page">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-name">
            <img src="/architect-logo.jpg" alt="Architect" className="hdr-logo" />
            <div>
              <div className="hdr-build">Campaign review</div>
              <div className="hdr-sub">{session.brandName || host}</div>
            </div>
          </div>
          <div className="hdr-stats">
            <div className="stat"><strong>{approvedVariations}</strong> / {totalVariations} approved</div>
            {noteCount > 0 && <div className="stat warn"><strong>{noteCount}</strong> with notes</div>}
          </div>
        </div>
      </header>

      <section className="content">
        {session.strategySummary && (
          <div className="strategy">
            <div className="strategy-label">The strategy</div>
            <p>{session.strategySummary}</p>
          </div>
        )}

        {/* Hero CTA: Approve all */}
        <div className={`hero-approve ${buildApproved ? "approved" : ""}`}>
          <div className="hero-approve-l">
            <h2>{buildApproved ? "Build approved - thanks!" : "Happy with everything?"}</h2>
            <p>{buildApproved ? "Your team has been notified. You can still leave specific notes below if anything else comes to mind." : `${totalVariations} variations across ${session.campaigns.length} campaign${session.campaigns.length === 1 ? "" : "s"}. Tap below to approve all in one go, or scroll down to review at the campaign or variation level.`}</p>
          </div>
          {!buildApproved && (
            <button className="btn-hero" onClick={approveAll}>
              Approve everything
            </button>
          )}
        </div>

        <p className="intro">
          Or review by campaign below. Each campaign card shows one preview - hit "Approve campaign" if it looks right, or expand to drill into the three angle variations per ad group.
        </p>

        {session.campaigns.map((c) => {
          const isExpanded = expandedCampaigns[c.id];
          const campaignApproved = feedback[`campaign_${c.id}`]?.status === "approved";
          const campaignVariationCount = c.adGroups.length * 3;
          const campaignApprovedCount = c.adGroups.reduce((sum, g) => {
            return sum + ANGLE_GROUPS.filter((ag) => feedback[`${g.id}__${ag.key}`]?.status === "approved").length;
          }, 0);
          // Pick first ad group's preview for the collapsed card
          const firstGroup = c.adGroups[0];
          const firstCopy = firstGroup?.copy;
          const previewHeadlines = firstCopy ? pickThree(firstCopy.headlines || [], () => true) : [];
          const previewDesc = firstCopy ? pickOneDesc(firstCopy.descriptions || [], () => true) : undefined;
          const previewPath = firstCopy?.paths?.filter(Boolean).join("/") || "";

          return (
            <div key={c.id} className={`campaign ${campaignApproved ? "approved" : ""}`}>
              <div className="campaign-h">
                <div className="campaign-accent" style={{ background: c.accent || "#FF66C3" }} />
                <div className="campaign-meta-l">
                  <div className="campaign-name">{c.name}</div>
                  <div className="campaign-meta">
                    {c.channelType} · {c.structure} · {c.adGroups.length} ad group{c.adGroups.length === 1 ? "" : "s"} · {campaignVariationCount} variation{campaignVariationCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="campaign-progress">
                  <strong>{campaignApprovedCount}</strong>/{campaignVariationCount} approved
                </div>
              </div>

              {c.clientRationale && !isExpanded && (
                <div className="rationale">{c.clientRationale}</div>
              )}

              {!isExpanded && firstCopy && (
                <div className="campaign-preview">
                  <div className="serp">
                    <div className="serp-row1">
                      <div className="serp-fav">{(session.brandName || host).slice(0, 1).toUpperCase()}</div>
                      <div>
                        <div className="serp-spons">Sponsored</div>
                        <div className="serp-host">
                          {host}
                          {previewPath ? <span className="serp-path"> &gt; {previewPath}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="serp-h">{previewHeadlines.map((h) => dkiVisible(h.text)).join(" | ")}</div>
                    <div className="serp-d">{previewDesc?.text || ""}</div>
                  </div>
                  <div className="campaign-preview-note">Showing one preview from <strong>{firstGroup?.name}</strong>. Expand to see all variations.</div>
                </div>
              )}

              <div className="campaign-actions">
                {!campaignApproved ? (
                  <button className="btn primary" onClick={() => approveCampaign(c)} disabled={buildApproved}>
                    Approve campaign
                  </button>
                ) : (
                  <span className="badge approved">✓ Campaign approved</span>
                )}
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
                    return (
                      <div key={g.id} className="adgroup">
                        <div className="adgroup-h">
                          <div className="adgroup-name">{g.name}</div>
                          <div className="adgroup-meta">{g.landingPath}</div>
                        </div>
                        <div className="variations">
                          {ANGLE_GROUPS.map((ag) => {
                            const headlines = pickThree(copy.headlines || [], ag.pick);
                            const desc = pickOneDesc(copy.descriptions || [], ag.pickD);
                            const variationKey = `${g.id}__${ag.key}`;
                            const fb = feedback[variationKey];
                            const path1 = copy.paths?.[0] || "";
                            const path2 = copy.paths?.[1] || "";
                            const pathDisplay = [path1, path2].filter(Boolean).join("/");
                            const headlineLine = headlines.map((h) => dkiVisible(h.text)).join(" | ");

                            return (
                              <div key={variationKey} className={`variation ${fb?.status || ""}`}>
                                <div className="variation-tag">{ag.label}</div>
                                <div className="serp">
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
                                  <div className="serp-h">{headlineLine}</div>
                                  <div className="serp-d">{desc?.text || ""}</div>
                                </div>
                                <div className="actions">
                                  {fb?.status === "approved" ? (
                                    <span className="badge approved">✓ Approved</span>
                                  ) : (
                                    <button className="btn primary sm" onClick={() => approveVariation(variationKey)}>
                                      Looks good
                                    </button>
                                  )}
                                  <textarea
                                    className="note-inline"
                                    placeholder="Anything you'd change?"
                                    defaultValue={fb?.note || ""}
                                    onBlur={(e) => noteVariation(variationKey, e.target.value)}
                                    rows={1}
                                  />
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

        {/* General feedback box */}
        <div className="general-feedback">
          <div className="general-feedback-l">
            <h3>General feedback {savingNote && <span className="saving">saving...</span>}</h3>
            <p>For anything that applies across all variations - tone, language, things to avoid, follow-up questions for the team.</p>
          </div>
          <textarea
            className="general-feedback-input"
            placeholder="e.g. Could we soften the urgency angle across the board? Also unsure about the headline using 'risk-free' - we don't have that guarantee in our T&Cs."
            value={generalFeedback}
            onChange={(e) => setGeneralFeedback(e.target.value)}
            onBlur={(e) => persistGeneralFeedback(e.target.value)}
            rows={5}
          />
        </div>

        <footer className="footer">
          <p>This review was created on {new Date(session.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.</p>
          <p className="footer-brand">Powered by <strong>Architect</strong>, a BRAIVE product.</p>
        </footer>
      </section>

      <style jsx>{`
        :global(html, body) { margin: 0; padding: 0; }
        :global(body) { background: #F4F3EF; font-family: "Manrope", ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0A0A0A; }
        .loading-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #666; font-size: 14px; }
        .missing { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .missing-card { max-width: 480px; padding: 32px; background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 12px; text-align: center; }
        .missing h1 { font-size: 20px; margin: 0 0 8px; font-weight: 700; }
        .missing p { font-size: 14px; color: #666; margin: 0; line-height: 1.5; }
        .page { min-height: 100vh; padding-bottom: 80px; }
        .hdr { background: white; border-bottom: 0.5px solid rgba(0,0,0,0.08); position: sticky; top: 0; z-index: 10; }
        .hdr-inner { max-width: 960px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .hdr-name { display: flex; align-items: center; gap: 12px; }
        .hdr-logo { height: 38px; width: auto; mix-blend-mode: multiply; }
        .hdr-build { font-size: 11px; color: #666; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
        .hdr-sub { font-size: 15px; font-weight: 700; color: #0A0A0A; }
        .hdr-stats { display: flex; gap: 18px; }
        .stat { font-size: 12.5px; color: #666; }
        .stat strong { color: #0A0A0A; font-weight: 700; }
        .stat.warn strong { color: #E64FAB; }
        .content { max-width: 960px; margin: 0 auto; padding: 24px; }
        .strategy { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-left: 3px solid #FF66C3; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
        .strategy-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #E64FAB; font-weight: 700; margin-bottom: 6px; }
        .strategy p { margin: 0; font-size: 14px; line-height: 1.6; color: #1A1A1A; }
        .hero-approve { background: linear-gradient(135deg, rgba(255,102,195,0.12), white); border: 1px solid #FF66C3; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .hero-approve.approved { background: linear-gradient(135deg, rgba(0,180,100,0.08), white); border-color: rgba(0,180,100,0.4); }
        .hero-approve-l { flex: 1; min-width: 280px; }
        .hero-approve h2 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
        .hero-approve p { margin: 0; font-size: 13.5px; color: #444; line-height: 1.55; }
        .btn-hero { background: #FF66C3; color: white; border: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.1s; font-family: inherit; flex-shrink: 0; }
        .btn-hero:hover { background: #E64FAB; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(255,102,195,0.35); }
        .intro { font-size: 13px; color: #666; margin: 0 0 24px; line-height: 1.5; }
        .campaign { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; transition: all 0.15s; }
        .campaign.approved { border-color: rgba(0,180,100,0.3); background: linear-gradient(180deg, rgba(0,180,100,0.03), white); }
        .campaign-h { display: flex; align-items: flex-start; gap: 12px; }
        .campaign-accent { width: 4px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
        .campaign-meta-l { flex: 1; min-width: 0; }
        .campaign-name { font-size: 16px; font-weight: 700; color: #0A0A0A; margin-bottom: 4px; }
        .campaign-meta { font-size: 11.5px; color: #666; }
        .campaign-progress { font-size: 12px; color: #444; padding: 4px 10px; background: #F4F3EF; border-radius: 4px; flex-shrink: 0; }
        .rationale { margin: 12px 0 0; padding: 10px 14px; background: rgba(255,102,195,0.06); border-radius: 6px; font-size: 12.5px; color: #1A1A1A; line-height: 1.55; border-left: 2px solid #FF66C3; }
        .campaign-preview { margin: 14px 0 0; }
        .campaign-preview-note { margin-top: 8px; font-size: 11px; color: #888; font-style: italic; }
        .campaign-actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
        .adgroups { margin-top: 18px; padding-top: 18px; border-top: 0.5px solid rgba(0,0,0,0.06); }
        .adgroup { margin-bottom: 18px; }
        .adgroup-h { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 0.5px dashed rgba(0,0,0,0.06); }
        .adgroup-name { font-size: 13.5px; font-weight: 700; color: #0A0A0A; }
        .adgroup-meta { font-size: 11px; color: #888; font-family: ui-monospace, SFMono-Regular, monospace; padding: 1px 8px; background: rgba(255,102,195,0.08); border-radius: 3px; color: #E64FAB; }
        .empty { font-size: 12px; color: #888; font-style: italic; padding: 12px; background: #F4F3EF; border-radius: 6px; }
        .variations { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .variation { background: #FAFAF7; border: 0.5px solid rgba(0,0,0,0.06); border-radius: 8px; padding: 12px; transition: all 0.15s; }
        .variation.approved { background: rgba(0,180,100,0.04); border-color: rgba(0,180,100,0.25); }
        .variation.comment { background: rgba(255,102,195,0.04); border-color: rgba(255,102,195,0.25); }
        .variation-tag { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; font-weight: 600; margin-bottom: 8px; }
        .serp { background: white; border: 0.5px solid rgba(0,0,0,0.06); border-radius: 6px; padding: 11px 13px; margin-bottom: 10px; }
        .serp-row1 { display: flex; gap: 8px; align-items: center; margin-bottom: 5px; }
        .serp-fav { width: 18px; height: 18px; background: #FF66C3; color: white; font-size: 10px; font-weight: 700; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .serp-spons { font-size: 10px; color: #444; font-weight: 500; }
        .serp-host { font-size: 11px; color: #444; }
        .serp-path { color: #888; }
        .serp-h { font-size: 14px; color: #1a0dab; line-height: 1.3; margin: 5px 0 4px; font-family: arial, sans-serif; }
        .serp-d { font-size: 11.5px; color: #4d5156; line-height: 1.45; font-family: arial, sans-serif; }
        .actions { display: flex; flex-direction: column; gap: 6px; }
        .btn { padding: 7px 12px; border-radius: 6px; border: 0.5px solid rgba(0,0,0,0.16); background: white; color: #0A0A0A; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.08s; }
        .btn.sm { padding: 5px 10px; font-size: 11px; }
        .btn.primary { background: #0A0A0A; color: white; border-color: #0A0A0A; }
        .btn.primary:hover { background: #1A1A1A; }
        .btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn.ghost { background: transparent; }
        .btn.ghost:hover { background: rgba(0,0,0,0.04); }
        .badge { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 5px; font-size: 11.5px; font-weight: 600; }
        .badge.approved { background: rgba(0,180,100,0.10); color: #0A8050; }
        .note-inline { width: 100%; resize: vertical; font-family: inherit; font-size: 11.5px; padding: 7px 9px; border: 0.5px solid rgba(0,0,0,0.10); border-radius: 5px; background: white; min-height: 32px; line-height: 1.4; }
        .note-inline:focus { outline: none; border-color: #FF66C3; box-shadow: 0 0 0 2px rgba(255,102,195,0.15); }
        .general-feedback { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 18px 20px; margin: 24px 0 0; }
        .general-feedback-l h3 { margin: 0 0 4px; font-size: 14.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .general-feedback-l .saving { font-size: 10px; color: #888; font-weight: 400; font-style: italic; }
        .general-feedback-l p { margin: 0 0 12px; font-size: 12px; color: #666; line-height: 1.5; }
        .general-feedback-input { width: 100%; resize: vertical; font-family: inherit; font-size: 13px; padding: 10px 12px; border: 0.5px solid rgba(0,0,0,0.10); border-radius: 6px; background: #FAFAF7; line-height: 1.5; box-sizing: border-box; }
        .general-feedback-input:focus { outline: none; border-color: #FF66C3; box-shadow: 0 0 0 2px rgba(255,102,195,0.15); background: white; }
        .footer { margin-top: 36px; padding-top: 18px; border-top: 0.5px solid rgba(0,0,0,0.06); text-align: center; font-size: 11.5px; color: #888; }
        .footer p { margin: 4px 0; }
        .footer-brand strong { color: #0A0A0A; }
        @media (max-width: 720px) {
          .variations { grid-template-columns: 1fr; }
          .hdr-stats { font-size: 11px; gap: 12px; }
        }
      `}</style>
    </main>
  );
}
