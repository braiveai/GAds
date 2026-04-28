"use client";

import { useEffect, useMemo, useState } from "react";

type Headline = { text: string; angle: string; pin: number | null; isDki?: boolean };
type Description = { text: string; angle: string; pin: number | null };
type Sitelink = { text: string; desc1: string; desc2: string };
type Copy = { headlines: Headline[]; descriptions: Description[]; paths: string[]; sitelinks: Sitelink[] };
type Keyword = { text: string; match: string };
type AdGroup = { id: string; name: string; landingPath: string; keywords: Keyword[]; copy?: Copy };
type Campaign = { id: string; name: string; structure: string; channelType: string; adGroups: AdGroup[]; accent?: string };
type Session = {
  buildName: string;
  brandName?: string;
  baseUrl: string;
  campaigns: Campaign[];
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
  // Use H1 (DKI/pinned) as anchor, then 2 from filter
  const result: Headline[] = [];
  if (headlines[0]) result.push(headlines[0]);
  for (const h of matched) {
    if (result.length >= 3) break;
    if (!result.find((r) => r.text === h.text)) result.push(h);
  }
  // If still under 3, fill from any
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
  const [openCommentFor, setOpenCommentFor] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("braive_review_" + token);
    if (!raw) {
      setMissing(true);
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
  }, [token]);

  function persistFeedback(next: Feedback) {
    setFeedback(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("braive_review_fb_" + token, JSON.stringify(next));
    }
  }

  function approve(key: string) {
    persistFeedback({ ...feedback, [key]: { status: "approved" } });
    setOpenCommentFor(null);
  }

  function saveNote(key: string, note: string) {
    persistFeedback({ ...feedback, [key]: { status: "comment", note } });
  }

  if (missing) {
    return (
      <main className="missing">
        <div className="missing-card">
          <h1>Review link not found</h1>
          <p>This review session could not be loaded. The link may have expired or the device used to open it differs from the device that created it.</p>
        </div>
        <style jsx>{`
          .missing { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #FAFAFA; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; }
          .missing-card { max-width: 480px; padding: 32px; background: white; border: 1px solid #e6e6ee; border-radius: 12px; text-align: center; }
          h1 { font-size: 18px; margin: 0 0 8px; color: #0A0A14; }
          p { font-size: 14px; color: #44444F; margin: 0; line-height: 1.5; }
        `}</style>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="loading">
        <div>Loading review...</div>
        <style jsx>{`
          .loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #7A7A85; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; }
        `}</style>
      </main>
    );
  }

  const host = hostFromUrl(session.baseUrl);
  const totalVariations = session.campaigns.reduce(
    (sum, c) => sum + (c.adGroups?.length || 0) * 3,
    0
  );
  const approvedCount = Object.values(feedback).filter((f) => f.status === "approved").length;
  const commentCount = Object.values(feedback).filter((f) => f.status === "comment").length;

  return (
    <main className="page">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-name">
            <div className="hdr-mark" />
            <div>
              <div className="hdr-build">{session.buildName}</div>
              <div className="hdr-sub">Campaign review for {session.brandName || host}</div>
            </div>
          </div>
          <div className="hdr-stats">
            <div className="stat"><strong>{approvedCount}</strong> approved</div>
            <div className="stat"><strong>{commentCount}</strong> with notes</div>
            <div className="stat"><strong>{totalVariations}</strong> variations</div>
          </div>
        </div>
      </header>

      <section className="content">
        <p className="intro">
          Below are the proposed Google Ads variations for your review. Each ad group has three angle variations.
          Tap "Looks good" to approve, or "Add note" to leave feedback for the team.
        </p>

        {session.campaigns.map((c) => (
          <div key={c.id} className="campaign">
            <div className="campaign-h">
              <div className="campaign-accent" style={{ background: c.accent || "#2541E8" }} />
              <div>
                <div className="campaign-name">{c.name}</div>
                <div className="campaign-meta">
                  {c.channelType} · {c.structure} · {c.adGroups.length} ad group{c.adGroups.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>

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
                  <div className="adgroup-name">{g.name}</div>
                  <div className="adgroup-meta">{g.landingPath}</div>

                  <div className="variations">
                    {ANGLE_GROUPS.map((ag) => {
                      const headlines = pickThree(copy.headlines || [], ag.pick);
                      const desc = pickOneDesc(copy.descriptions || [], ag.pickD);
                      const key = `${g.id}__${ag.key}`;
                      const fb = feedback[key];
                      const path1 = copy.paths?.[0] || "";
                      const path2 = copy.paths?.[1] || "";
                      const pathDisplay = [path1, path2].filter(Boolean).join("/");

                      const headlineLine = headlines
                        .map((h) => dkiVisible(h.text))
                        .join(" | ");

                      return (
                        <div key={key} className={`variation ${fb?.status || ""}`}>
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
                              <span className="badge approved">✓ Looks good</span>
                            ) : (
                              <button className="btn primary" onClick={() => approve(key)}>Looks good</button>
                            )}
                            <button
                              className="btn"
                              onClick={() => setOpenCommentFor(openCommentFor === key ? null : key)}
                            >
                              {fb?.status === "comment" ? "Edit note" : "Add note"}
                            </button>
                          </div>

                          {(openCommentFor === key || fb?.status === "comment") && (
                            <textarea
                              className="note"
                              placeholder="Anything you'd like changed?"
                              defaultValue={fb?.note || ""}
                              onBlur={(e) => saveNote(key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Disclosure section */}
        <details className="disclosure">
          <summary>Full asset disclosure - every headline, description, sitelink</summary>
          <div className="disc-body">
            {session.campaigns.map((c) =>
              c.adGroups.map((g) =>
                g.copy ? (
                  <div key={g.id} className="disc-block">
                    <div className="disc-h"><span>{c.name}</span> · <strong>{g.name}</strong></div>
                    <div className="disc-grid">
                      <div>
                        <div className="disc-label">Headlines</div>
                        <ol>
                          {(g.copy.headlines || []).map((h, i) => (
                            <li key={i}>
                              <span className="mono">{h.text}</span>
                              <span className="meta">
                                {dkiVisible(h.text).length}/30 · {h.angle}
                                {h.pin != null ? ` · pin ${h.pin}` : ""}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <div className="disc-label">Descriptions</div>
                        <ol>
                          {(g.copy.descriptions || []).map((d, i) => (
                            <li key={i}>
                              <span>{d.text}</span>
                              <span className="meta">{(d.text || "").length}/90 · {d.angle}</span>
                            </li>
                          ))}
                        </ol>
                        <div className="disc-label" style={{ marginTop: 12 }}>Display paths</div>
                        <div className="mono small">/{g.copy.paths?.[0] || ""}/{g.copy.paths?.[1] || ""}</div>
                        <div className="disc-label" style={{ marginTop: 12 }}>Sitelinks</div>
                        <ol>
                          {(g.copy.sitelinks || []).map((s, i) => (
                            <li key={i}>
                              <strong>{s.text}</strong>
                              <span className="meta">{s.desc1} · {s.desc2}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                ) : null
              )
            )}
          </div>
        </details>
      </section>

      <footer className="ftr">
        <span>Powered by <strong>BRAIVE</strong></span>
      </footer>

      <style jsx>{`
        :global(html), :global(body) { margin: 0; padding: 0; background: #FAFAFA; }
        .page { min-height: 100vh; background: #FAFAFA; color: #0A0A14; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .hdr { background: white; border-bottom: 1px solid #e6e6ee; }
        .hdr-inner { max-width: 1080px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .hdr-name { display: flex; align-items: center; gap: 12px; }
        .hdr-mark { width: 28px; height: 28px; border-radius: 6px; background: linear-gradient(135deg, #2541E8, #B8C0FF); box-shadow: 0 0 16px rgba(37, 65, 232, 0.3); }
        .hdr-build { font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
        .hdr-sub { font-size: 12px; color: #7A7A85; margin-top: 2px; }
        .hdr-stats { display: flex; gap: 16px; }
        .stat { font-size: 12px; color: #7A7A85; }
        .stat strong { color: #0A0A14; font-weight: 700; }

        .content { max-width: 1080px; margin: 0 auto; padding: 24px; }
        .intro { font-size: 13.5px; color: #44444F; line-height: 1.55; margin: 0 0 24px; max-width: 640px; }

        .campaign { margin-bottom: 32px; }
        .campaign-h { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e6e6ee; }
        .campaign-accent { width: 4px; height: 28px; border-radius: 2px; }
        .campaign-name { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
        .campaign-meta { font-size: 11.5px; color: #7A7A85; margin-top: 2px; font-family: ui-monospace, monospace; letter-spacing: 0.04em; }

        .adgroup { background: white; border: 1px solid #e6e6ee; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
        .adgroup-name { font-size: 13.5px; font-weight: 600; margin-bottom: 2px; }
        .adgroup-meta { font-size: 11px; color: #7A7A85; font-family: ui-monospace, monospace; margin-bottom: 14px; }

        .variations { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }

        .variation { background: #FAFAFA; border: 1px solid #e6e6ee; border-radius: 8px; padding: 12px; transition: border-color 0.1s; }
        .variation.approved { border-color: #0F9D6F; background: rgba(15, 157, 111, 0.04); }
        .variation.comment { border-color: #C24A1F; background: rgba(194, 74, 31, 0.04); }
        .variation-tag { font-family: ui-monospace, monospace; font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; color: #7A7A85; margin-bottom: 8px; font-weight: 600; }

        .serp { background: white; border: 1px solid #e6e6ee; border-radius: 6px; padding: 12px; font-family: arial, sans-serif; }
        .serp-row1 { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
        .serp-fav { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #2541E8, #6f7eff); color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .serp-spons { font-size: 10.5px; color: #5f6368; font-weight: 700; line-height: 1.1; }
        .serp-host { font-size: 11.5px; color: #1f2937; line-height: 1.2; }
        .serp-path { color: #5f6368; }
        .serp-h { font-size: 16px; font-weight: 400; color: #1a0dab; line-height: 1.3; margin: 6px 0 4px; word-wrap: break-word; }
        .serp-d { font-size: 12.5px; color: #4d5156; line-height: 1.45; margin: 0; }

        .actions { display: flex; gap: 8px; margin-top: 10px; }
        .btn { padding: 6px 12px; font-size: 12px; font-family: inherit; font-weight: 500; border-radius: 5px; cursor: pointer; border: 1px solid #d4d4dc; background: white; color: #0A0A14; transition: all 0.1s; }
        .btn:hover { background: #f4f4f7; border-color: #b4b4bf; }
        .btn.primary { background: #2541E8; color: white; border-color: #2541E8; }
        .btn.primary:hover { background: #1d35c2; }

        .badge.approved { display: inline-flex; align-items: center; padding: 6px 10px; font-size: 12px; font-weight: 600; color: #0F9D6F; background: rgba(15, 157, 111, 0.10); border: 1px solid rgba(15, 157, 111, 0.3); border-radius: 5px; }

        .note { width: 100%; margin-top: 8px; padding: 8px 10px; font-family: inherit; font-size: 12.5px; border: 1px solid #d4d4dc; border-radius: 5px; background: white; color: #0A0A14; resize: vertical; min-height: 60px; }
        .note:focus { outline: none; border-color: #2541E8; box-shadow: 0 0 0 3px rgba(37, 65, 232, 0.08); }

        .empty { font-size: 12px; color: #7A7A85; padding: 12px; background: #fafafa; border-radius: 6px; }

        .disclosure { margin-top: 32px; background: white; border: 1px solid #e6e6ee; border-radius: 10px; padding: 0; overflow: hidden; }
        .disclosure summary { padding: 14px 18px; font-size: 13px; font-weight: 600; cursor: pointer; user-select: none; }
        .disclosure summary:hover { background: #fafafa; }
        .disc-body { padding: 18px; border-top: 1px solid #e6e6ee; }
        .disc-block { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid #f0f0f4; }
        .disc-block:last-child { border-bottom: none; margin-bottom: 0; }
        .disc-h { font-size: 12.5px; color: #44444F; margin-bottom: 10px; }
        .disc-h strong { color: #0A0A14; font-weight: 700; }
        .disc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 720px) { .disc-grid { grid-template-columns: 1fr; } }
        .disc-label { font-family: ui-monospace, monospace; font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A7A85; margin-bottom: 6px; font-weight: 600; }
        .disc-body ol { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: #0A0A14; }
        .disc-body li { margin-bottom: 4px; }
        .meta { font-family: ui-monospace, monospace; font-size: 10px; color: #7A7A85; margin-left: 8px; letter-spacing: 0.02em; }
        .mono { font-family: ui-monospace, monospace; }
        .small { font-size: 11.5px; color: #44444F; }

        .ftr { padding: 32px 24px; text-align: center; font-size: 11.5px; color: #7A7A85; border-top: 1px solid #e6e6ee; margin-top: 40px; background: white; }
        .ftr strong { color: #0A0A14; }
      `}</style>
    </main>
  );
}
