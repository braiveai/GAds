"use client";

import { useEffect, useRef, useState } from "react";

/* ============================================================
   TYPES
   ============================================================ */

type Channel = "Search" | "PMax" | "Demand";
type Match = "PHR" | "EXC" | "BRD";

type AngleEntry = { title: string; desc: string };
type Brand = {
  toneOfVoice: string;
  targetAudience: string;
  usps: string[];
  mustIncludeKeywords: string[];
};
type Angles = { pain: AngleEntry[]; aspiration: AngleEntry[] };

type Brief = {
  brand: Brand;
  angles: Angles;
  recommendedLean: number;
  pagesScraped?: number;
};

type Keyword = { id: string; text: string; match: Match; estimatedVolume?: string };
type Headline = { id?: string; text: string; angle: string; pin: number | null; length?: number; overLimit?: boolean; isDki?: boolean };
type Description = { id?: string; text: string; angle: string; pin: number | null; length?: number; overLimit?: boolean };
type Sitelink = { id?: string; text: string; desc1: string; desc2: string };
type Copy = { headlines: Headline[]; descriptions: Description[]; paths: string[]; sitelinks: Sitelink[] };

type AdGroup = {
  id: string;
  name: string;
  landingPath: string;
  keywords: Keyword[];
  copy?: Copy;
};

type Campaign = {
  id: string;
  name: string;
  structure: "MKAG" | "SKAG" | "STAG" | "Hagakure" | "Custom";
  channelType: Channel;
  budget: number;
  locations: string[];
  bidStrategy: string;
  audiences: string[];
  negatives: string[];
  aiNote: string;
  adGroups: AdGroup[];
  accent?: string;
};

type Stage = "brief" | "architect" | "generate" | "review";
type ArchSub = "campaigns" | "keywords" | "targeting" | "review";

type ErrorState = { message: string; debug?: any } | null;
type ToastState = { type: "success" | "error" | "info"; message: string } | null;
type LoadingState = { message: string; sub?: string } | null;

/* ============================================================
   CONSTANTS
   ============================================================ */

const STRUCTURE_OPTIONS = ["MKAG", "SKAG", "STAG", "Hagakure", "Custom"] as const;
const CHANNEL_OPTIONS: Channel[] = ["Search", "PMax", "Demand"];
const MATCH_OPTIONS: Match[] = ["PHR", "EXC", "BRD"];
const BID_STRATEGIES = [
  "Maximise conversions",
  "Maximise conversion value",
  "Target CPA",
  "Target ROAS",
  "Manual CPC",
  "Maximise clicks",
];

const STAGE_ORDER: Stage[] = ["brief", "architect", "generate", "review"];
const ARCH_SUBS: { key: ArchSub; label: string; sub: string }[] = [
  { key: "campaigns", label: "Campaigns", sub: "01" },
  { key: "keywords", label: "Keywords", sub: "02" },
  { key: "targeting", label: "Targeting", sub: "03" },
  { key: "review", label: "Review", sub: "04" },
];

const PERSIST_KEY = "braive_ads_state_v1";
const ACCENTS = ["#2541E8", "#0F9D6F", "#1F6E8C", "#C24A1F"];

/* ============================================================
   HELPERS
   ============================================================ */

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

function dkiVisible(text: string) {
  const m = text.match(/^\{(?:KeyWord|Keyword|KEYWORD):([^}]+)\}$/);
  return m ? m[1] : text;
}

function cycleMatch(m: Match): Match {
  const idx = MATCH_OPTIONS.indexOf(m);
  return MATCH_OPTIONS[(idx + 1) % MATCH_OPTIONS.length];
}

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function safeHost(url: string) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ============================================================
   STABLE SUB-COMPONENT (module scope - safe, has its own state)
   ============================================================ */

function KwAdd({ onAdd }: { onAdd: (raw: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <input
      className="kw-add-input"
      placeholder="+ add keyword (paste many)"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          if (val.trim()) {
            onAdd(val);
            setVal("");
          }
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        if (text.includes("\n") || text.includes(",")) {
          e.preventDefault();
          onAdd(text);
          setVal("");
        }
      }}
      onBlur={() => {
        if (val.trim()) {
          onAdd(val);
          setVal("");
        }
      }}
    />
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function Page() {
  // Persisted
  const [stage, setStage] = useState<Stage>("brief");
  const [archSub, setArchSub] = useState<ArchSub>("campaigns");
  const [briefUrl, setBriefUrl] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [leanValue, setLeanValue] = useState(50);
  const [channels, setChannels] = useState<Channel[]>(["Search"]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeAdGroupKey, setActiveAdGroupKey] = useState<string | null>(null);

  // UI-only
  const [error, setError] = useState<ErrorState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState<LoadingState>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [healthInfo, setHealthInfo] = useState<any>(null);
  const [reviewModal, setReviewModal] = useState<{ open: boolean; token?: string; url?: string }>({ open: false });
  const [debugOpen, setDebugOpen] = useState(false);
  const restoredRef = useRef(false);

  /* ----- Restore from localStorage on mount ----- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.briefUrl) setBriefUrl(s.briefUrl);
        if (s.brief) setBrief(s.brief);
        if (typeof s.leanValue === "number") setLeanValue(s.leanValue);
        if (Array.isArray(s.channels)) setChannels(s.channels);
        if (Array.isArray(s.campaigns)) setCampaigns(s.campaigns);
        if (s.stage) setStage(s.stage);
        if (s.archSub) setArchSub(s.archSub);
        if (s.activeAdGroupKey) setActiveAdGroupKey(s.activeAdGroupKey);
      }
    } catch {}
    restoredRef.current = true;
  }, []);

  /* ----- Persist on change ----- */
  useEffect(() => {
    if (!restoredRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const payload = { briefUrl, brief, leanValue, channels, campaigns, stage, archSub, activeAdGroupKey };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch {}
  }, [briefUrl, brief, leanValue, channels, campaigns, stage, archSub, activeAdGroupKey]);

  /* ----- Health check on mount ----- */
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setHealth(j.ok ? "ok" : "down");
        setHealthInfo(j);
      })
      .catch((e) => {
        if (!alive) return;
        setHealth("down");
        setHealthInfo({ error: String(e) });
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ----- Toast auto-dismiss ----- */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ============================================================
     ACTIONS
     ============================================================ */

  async function handleScrapeBrief() {
    if (!briefUrl.trim()) {
      setError({ message: "Enter a URL first" });
      return;
    }
    setError(null);
    setLoading({ message: "Scraping site", sub: "Reading homepage and 4 inner pages..." });
    try {
      const res = await fetch("/api/scrape-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: briefUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError({ message: data.error || `HTTP ${res.status}`, debug: data.debug });
        return;
      }
      const b: Brief = { ...data.brief, pagesScraped: data.pagesScraped };
      setBrief(b);
      setLeanValue(b.recommendedLean ?? 50);
      setToast({ type: "success", message: `Brief extracted from ${data.pagesScraped} page${data.pagesScraped === 1 ? "" : "s"}` });
    } catch (err: any) {
      setError({ message: err?.message || String(err), debug: { exception: String(err) } });
    } finally {
      setLoading(null);
    }
  }

  async function handleProposeArchitecture() {
    if (!brief) {
      setError({ message: "Need a brief first" });
      return;
    }
    setError(null);
    setLoading({ message: "Proposing architecture", sub: "Opus is sketching campaigns..." });
    try {
      const res = await fetch("/api/propose-architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: briefUrl,
          brand: brief.brand,
          angles: brief.angles,
          leanPercent: leanValue,
          channels,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError({ message: data.error || `HTTP ${res.status}`, debug: data.debug });
        return;
      }
      setCampaigns(data.campaigns || []);
      setStage("architect");
      setArchSub("campaigns");
      const firstC = data.campaigns?.[0];
      const firstG = firstC?.adGroups?.[0];
      if (firstC && firstG) setActiveAdGroupKey(`${firstC.id}__${firstG.id}`);
      setToast({ type: "success", message: `${data.campaigns?.length || 0} campaigns proposed` });
    } catch (err: any) {
      setError({ message: err?.message || String(err), debug: { exception: String(err) } });
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateCopy(campaign: Campaign, adGroup: AdGroup) {
    if (!brief) return;
    setError(null);
    setLoading({ message: "Generating RSA copy", sub: `${adGroup.name}...` });
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brief.brand,
          angles: brief.angles,
          leanPercent: leanValue,
          campaign: { name: campaign.name, structure: campaign.structure, channelType: campaign.channelType },
          adGroup,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError({ message: data.error || `HTTP ${res.status}`, debug: data.debug });
        return;
      }
      const newCopy: Copy = {
        headlines: data.headlines || [],
        descriptions: data.descriptions || [],
        paths: data.paths || [],
        sitelinks: data.sitelinks || [],
      };
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaign.id
            ? { ...c, adGroups: c.adGroups.map((g) => (g.id === adGroup.id ? { ...g, copy: newCopy } : g)) }
            : c
        )
      );
      setToast({ type: "success", message: `Copy generated for ${adGroup.name}` });
    } catch (err: any) {
      setError({ message: err?.message || String(err), debug: { exception: String(err) } });
    } finally {
      setLoading(null);
    }
  }

  async function handleExport(format: "xlsx" | "csv") {
    setError(null);
    setLoading({ message: `Building ${format.toUpperCase()}`, sub: "Packaging campaigns..." });
    try {
      const res = await fetch(`/api/export-${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaigns,
          buildName: "BRAIVE Ads Build",
          baseUrl: briefUrl,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({ message: data.error || `HTTP ${res.status}`, debug: data });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `braive-ads.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ type: "success", message: `${format.toUpperCase()} downloaded` });
    } catch (err: any) {
      setError({ message: err?.message || String(err), debug: { exception: String(err) } });
    } finally {
      setLoading(null);
    }
  }

  function handleGenerateReviewLink() {
    if (!campaigns.length) {
      setError({ message: "Need an architected build before generating a review link" });
      return;
    }
    const token = rid("rv").replace(/^rv_/, "");
    const session = {
      buildName: "BRAIVE Ads Build",
      brandName: undefined,
      baseUrl: briefUrl,
      campaigns,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("braive_review_" + token, JSON.stringify(session));
    } catch (e: any) {
      setError({ message: "Could not store review session: " + e?.message, debug: { exception: String(e) } });
      return;
    }
    const url = `${window.location.origin}/r/${token}`;
    setReviewModal({ open: true, token, url });
  }

  function handleReset() {
    if (!confirm("Reset all state? This clears the current build from local storage.")) return;
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch {}
    setBriefUrl("");
    setBrief(null);
    setLeanValue(50);
    setChannels(["Search"]);
    setCampaigns([]);
    setActiveAdGroupKey(null);
    setStage("brief");
    setArchSub("campaigns");
    setError(null);
  }

  /* ----- Mutators ----- */

  function updateCampaign(id: string, patch: Partial<Campaign>) {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function addCampaign() {
    const next: Campaign = {
      id: rid("c"),
      name: "New theme x sub-theme | SD",
      structure: "MKAG",
      channelType: "Search",
      budget: 50,
      locations: ["Australia"],
      bidStrategy: "Maximise conversions",
      audiences: [],
      negatives: [],
      aiNote: "",
      adGroups: [],
      accent: ACCENTS[campaigns.length % ACCENTS.length],
    };
    setCampaigns((prev) => [...prev, next]);
  }
  function removeCampaign(id: string) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }
  function updateKeyword(cId: string, gId: string, kId: string, patch: Partial<Keyword>) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === cId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) =>
                g.id === gId
                  ? { ...g, keywords: g.keywords.map((k) => (k.id === kId ? { ...k, ...patch } : k)) }
                  : g
              ),
            }
          : c
      )
    );
  }
  function removeKeyword(cId: string, gId: string, kId: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === cId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) =>
                g.id === gId ? { ...g, keywords: g.keywords.filter((k) => k.id !== kId) } : g
              ),
            }
          : c
      )
    );
  }
  function addKeywords(cId: string, gId: string, raw: string) {
    const items = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ id: rid("k"), text, match: "PHR" as Match }));
    if (!items.length) return;
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === cId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) =>
                g.id === gId ? { ...g, keywords: [...g.keywords, ...items] } : g
              ),
            }
          : c
      )
    );
  }

  function setHeadlineText(campaignId: string, agId: string, idx: number, newText: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) =>
                g.id === agId && g.copy
                  ? {
                      ...g,
                      copy: {
                        ...g.copy,
                        headlines: g.copy.headlines.map((hh, ii) =>
                          ii === idx
                            ? {
                                ...hh,
                                text: newText,
                                length: dkiVisible(newText).length,
                                overLimit: dkiVisible(newText).length > 30,
                              }
                            : hh
                        ),
                      },
                    }
                  : g
              ),
            }
          : c
      )
    );
  }

  function setDescriptionText(campaignId: string, agId: string, idx: number, newText: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) =>
                g.id === agId && g.copy
                  ? {
                      ...g,
                      copy: {
                        ...g.copy,
                        descriptions: g.copy.descriptions.map((dd, ii) =>
                          ii === idx
                            ? {
                                ...dd,
                                text: newText,
                                length: newText.length,
                                overLimit: newText.length > 90,
                              }
                            : dd
                        ),
                      },
                    }
                  : g
              ),
            }
          : c
      )
    );
  }

  function setPathText(campaignId: string, agId: string, idx: 0 | 1, newText: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              adGroups: c.adGroups.map((g) => {
                if (g.id !== agId || !g.copy) return g;
                const paths = [g.copy.paths[0] || "", g.copy.paths[1] || ""];
                paths[idx] = newText;
                return { ...g, copy: { ...g.copy, paths } };
              }),
            }
          : c
      )
    );
  }

  /* ============================================================
     COMPUTED
     ============================================================ */

  const stageStatus = (s: Stage): "active" | "done" | "todo" => {
    const a = STAGE_ORDER.indexOf(stage);
    const b = STAGE_ORDER.indexOf(s);
    if (b < a) return "done";
    if (b === a) return "active";
    return "todo";
  };

  const allAdGroups: { campaign: Campaign; ag: AdGroup; key: string }[] = [];
  for (const c of campaigns) {
    for (const g of c.adGroups) {
      allAdGroups.push({ campaign: c, ag: g, key: `${c.id}__${g.id}` });
    }
  }
  const active = allAdGroups.find((x) => x.key === activeAdGroupKey) || allAdGroups[0];

  const stageLabels: Record<Stage, string> = {
    brief: "Brief",
    architect: "Architect",
    generate: "Generate",
    review: "Client review",
  };

  /* ============================================================
     RENDER (one big tree, no inner function components)
     ============================================================ */

  return (
    <div className="app-layout">

      {/* ============ SIDEBAR ============ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <span className="brand-name">BRAIVE</span>
            <span className="brand-product">Ads</span>
          </div>
        </div>

        <div className="nav-section">
          <button className="nav-item" onClick={handleReset}>
            <span className="nav-icon">⌂</span>
            <span>Home / Brands</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-label">Current build</div>
          <div className="sidebar-stage-nav">
            {STAGE_ORDER.map((s, i) => {
              const status = stageStatus(s);
              return (
                <div key={s}>
                  <button
                    className={classNames(
                      "stage-nav-item",
                      status === "active" && "active",
                      status === "done" && "done"
                    )}
                    onClick={() => {
                      if (status !== "todo" || campaigns.length) setStage(s);
                    }}
                  >
                    <span className="stage-nav-num">{i + 1}</span>
                    <span>{stageLabels[s]}</span>
                  </button>
                  {s === "architect" && stage === "architect" && (
                    <div className="stage-nav-substages">
                      {ARCH_SUBS.map((sub) => (
                        <button
                          key={sub.key}
                          className={classNames("substage-nav-item", archSub === sub.key && "active")}
                          onClick={() => setArchSub(sub.key)}
                        >
                          <span className="substage-nav-dot" />
                          <span>{sub.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">MT</div>
            <div>
              <p className="user-name">Matt Travers</p>
              <p className="user-org">BRAIVE</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main className="main">

        {/* ----- TOPBAR ----- */}
        <div className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-segment">Builds</span>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-segment active">{briefUrl ? safeHost(briefUrl) : "New build"}</span>
          </div>
          <span
            className={classNames("health-badge", health)}
            title={health === "ok" ? `API ${healthInfo?.elapsedMs}ms` : health === "down" ? `API down: ${healthInfo?.error || ""}` : "Checking..."}
          >
            <span className="health-dot" />
            {health === "ok" ? "API OK" : health === "down" ? "API DOWN" : "..."}
          </span>
          {stage === "generate" && (
            <>
              <button className="btn sm" onClick={() => handleExport("xlsx")}>↓ XLSX</button>
              <button className="btn sm" onClick={() => handleExport("csv")}>↓ CSV</button>
            </>
          )}
          <button className="btn sm ghost" onClick={handleReset}>Reset</button>
        </div>

        {/* ----- BRIEF VIEW ----- */}
        <div className={classNames("view", stage === "brief" && "active")}>
          <div className="brief">
            <div className="stage-header">
              <div>
                <p className="stage-eyebrow">Stage 01 / Brief</p>
                <h1 className="stage-title">Brand <em>fingerprint</em></h1>
                <p className="stage-sub">Drop a URL. We'll scrape the homepage and a few inner pages, extract tone, audience, USPs, must-include keywords, and 6 strategic angles.</p>
              </div>
            </div>

            <div className="brief-input-row">
              <input
                className="text-input"
                placeholder="brand.com.au"
                value={briefUrl}
                onChange={(e) => setBriefUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScrapeBrief();
                }}
              />
              <button className="btn primary" onClick={handleScrapeBrief} disabled={!!loading}>
                Scrape →
              </button>
            </div>
            <p className="text-helper">
              uses real browser headers, follows redirects, 15s timeout. extracts via Sonnet tool_use schema.
            </p>

            {brief && (
              <>
                <div className="brief-section">
                  <div className="label-mono">
                    Brand fingerprint
                    <span className="count ai">{brief.pagesScraped || 1} pages</span>
                  </div>
                  <div className="fingerprint">
                    <div className="fp-cell">
                      <p className="fp-cell-label">Tone of voice</p>
                      <p className="fp-cell-value">{brief.brand.toneOfVoice}</p>
                    </div>
                    <div className="fp-cell">
                      <p className="fp-cell-label">Target audience</p>
                      <p className="fp-cell-value">{brief.brand.targetAudience}</p>
                    </div>
                    <div className="fp-cell">
                      <p className="fp-cell-label">USPs</p>
                      <div className="fp-tags">
                        {brief.brand.usps.map((u, i) => (
                          <span key={i} className="fp-tag">{u}</span>
                        ))}
                      </div>
                    </div>
                    <div className="fp-cell">
                      <p className="fp-cell-label">Must-include keywords</p>
                      <div className="fp-tags">
                        {brief.brand.mustIncludeKeywords.map((k, i) => (
                          <span key={i} className="fp-tag">{k}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="brief-section">
                  <div className="label-mono">Strategic angles</div>
                  <div className="strategy-grid">
                    <div className="angle-col">
                      <h4>Pain <em>problems</em></h4>
                      {brief.angles.pain.map((a, i) => (
                        <div key={i} className="angle-card pain">
                          <p className="angle-card-title">{a.title}</p>
                          <p className="angle-card-desc">{a.desc}</p>
                        </div>
                      ))}
                    </div>
                    <div className="angle-col">
                      <h4>Aspiration <em>outcomes</em></h4>
                      {brief.angles.aspiration.map((a, i) => (
                        <div key={i} className="angle-card aspire">
                          <p className="angle-card-title">{a.title}</p>
                          <p className="angle-card-desc">{a.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="brief-section">
                  <div className="label-mono">Angle lean <span className="count">{leanValue}% aspiration</span></div>
                  <div className="lean-slider">
                    <input
                      className="lean-input"
                      type="range"
                      min={0}
                      max={100}
                      value={leanValue}
                      onChange={(e) => setLeanValue(Number(e.target.value))}
                    />
                  </div>
                  <div className="lean-ends">
                    <span className="pe">PAIN END</span>
                    <span className="ae">ASPIRATION END</span>
                  </div>
                </div>

                <div className="brief-section">
                  <div className="label-mono">Channels</div>
                  <div className="channel-grid">
                    {CHANNEL_OPTIONS.map((c) => {
                      const checked = channels.includes(c);
                      return (
                        <div
                          key={c}
                          className={classNames("channel-card", checked && "checked")}
                          onClick={() => {
                            setChannels((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                            );
                          }}
                        >
                          <div className="channel-card-h">
                            <span className="channel-card-name">{c}</span>
                            <span className="channel-card-c" />
                          </div>
                          <p className="channel-card-desc">
                            {c === "Search" ? "Keywords + RSAs" : c === "PMax" ? "Asset groups + signals" : "Discovery feeds"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="action-row">
                  <span className="summary">
                    <strong>{channels.length}</strong> channel{channels.length === 1 ? "" : "s"} · <strong>{leanValue}%</strong> aspiration lean
                  </span>
                  <button className="btn primary" onClick={handleProposeArchitecture} disabled={!!loading}>
                    Architect →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ----- ARCHITECT VIEW ----- */}
        <div className={classNames("view", stage === "architect" && "active")}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 02 / Architect</p>
              <h1 className="stage-title">Build the <em>architecture</em></h1>
              <p className="stage-sub">Step through campaigns, keywords, targeting, then review.</p>
            </div>
          </div>

          <div className="arch-substages">
            {ARCH_SUBS.map((s) => (
              <button
                key={s.key}
                className={classNames("arch-substage", archSub === s.key && "active")}
                onClick={() => setArchSub(s.key)}
              >
                <span className="arch-substage-num">{s.sub}</span>
                <span className="arch-substage-label">
                  <span className="arch-substage-title">{s.label}</span>
                </span>
              </button>
            ))}
          </div>

          {archSub === "campaigns" && (
            <div className="substage-content wide">
              <div className="substage-intro">
                <h2>Campaigns</h2>
                <p>Name, structure, channel, budget. Naming convention: <code className="mono-inline">{`{Theme} x {Sub-theme} | SD`}</code></p>
              </div>
              <div className="campaign-form-list">
                {campaigns.map((c) => (
                  <div key={c.id} className="campaign-form-card">
                    <div className="cfc-h">
                      <div className="cfc-accent" style={{ background: c.accent }} />
                      <input
                        className="cfc-name"
                        value={c.name}
                        onChange={(e) => updateCampaign(c.id, { name: e.target.value })}
                      />
                      <button className="cfc-remove" onClick={() => removeCampaign(c.id)} title="Remove campaign">×</button>
                    </div>
                    <div className="cfc-grid">
                      <div className="cfc-field">
                        <label>Structure</label>
                        <div className="seg">
                          {STRUCTURE_OPTIONS.map((s) => (
                            <button
                              key={s}
                              className={classNames("seg-btn", c.structure === s && "active")}
                              onClick={() => updateCampaign(c.id, { structure: s })}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="cfc-field">
                        <label>Channel</label>
                        <div className="seg">
                          {CHANNEL_OPTIONS.map((s) => (
                            <button
                              key={s}
                              className={classNames("seg-btn", c.channelType === s && "active")}
                              onClick={() => updateCampaign(c.id, { channelType: s })}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="cfc-field">
                        <label>Daily budget (AUD)</label>
                        <input
                          className="text-input"
                          type="number"
                          value={c.budget}
                          onChange={(e) => updateCampaign(c.id, { budget: Number(e.target.value) })}
                        />
                      </div>
                      <div className="cfc-field">
                        <label>Ad groups</label>
                        <div className="cfc-counts">
                          <strong>{c.adGroups.length}</strong> ad group{c.adGroups.length === 1 ? "" : "s"} ·{" "}
                          <strong>{c.adGroups.reduce((s, g) => s + g.keywords.length, 0)}</strong> keywords
                        </div>
                      </div>
                    </div>
                    {c.aiNote && <div className="ai-inline">{c.aiNote}</div>}
                  </div>
                ))}
                <button className="add-campaign-btn" onClick={addCampaign}>+ Add campaign</button>
              </div>
            </div>
          )}

          {archSub === "keywords" && (
            <div className="substage-content wide">
              <div className="substage-intro">
                <h2>Keywords</h2>
                <p>Click a match label (PHR / EXC / BRD) to cycle. Paste multiple keywords - newlines or commas split them.</p>
              </div>
              {campaigns.map((c) => (
                <div key={c.id} className="kw-block">
                  <div className="kw-block-h">
                    <div className="kw-block-accent" style={{ background: c.accent }} />
                    <span className="kw-block-name">{c.name}</span>
                    <span className="kw-block-meta">{c.adGroups.length} groups</span>
                  </div>
                  {c.adGroups.map((g) => (
                    <div key={g.id} className="kw-group">
                      <div className="kw-group-h">
                        <strong>{g.name}</strong>
                        <span className="kw-group-meta">{g.landingPath}</span>
                        <span className="kw-group-count">{g.keywords.length} keywords</span>
                      </div>
                      <div className="kw-list">
                        {g.keywords.map((k) => (
                          <span key={k.id} className="kw-chip">
                            <button
                              className={classNames(
                                "kw-match",
                                k.match === "PHR" && "phrase",
                                k.match === "EXC" && "exact",
                                k.match === "BRD" && "broad"
                              )}
                              onClick={() => updateKeyword(c.id, g.id, k.id, { match: cycleMatch(k.match) })}
                            >
                              {k.match}
                            </button>
                            <span className="kw-text">{k.text}</span>
                            <span className="kw-x" onClick={() => removeKeyword(c.id, g.id, k.id)}>×</span>
                          </span>
                        ))}
                        <KwAdd onAdd={(raw) => addKeywords(c.id, g.id, raw)} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {archSub === "targeting" && (
            <div className="substage-content wide">
              <div className="substage-intro">
                <h2>Targeting</h2>
                <p>Locations, audiences, negatives, bid strategy.</p>
              </div>
              {campaigns.map((c) => (
                <div key={c.id} className="campaign-form-card">
                  <div className="cfc-h">
                    <div className="cfc-accent" style={{ background: c.accent }} />
                    <strong>{c.name}</strong>
                  </div>
                  <div className="cfc-grid">
                    <div className="cfc-field">
                      <label>Locations</label>
                      <input
                        className="text-input"
                        value={c.locations.join(", ")}
                        onChange={(e) => updateCampaign(c.id, { locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      />
                    </div>
                    <div className="cfc-field">
                      <label>Bid strategy</label>
                      <select
                        className="text-input"
                        value={c.bidStrategy}
                        onChange={(e) => updateCampaign(c.id, { bidStrategy: e.target.value })}
                      >
                        {BID_STRATEGIES.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="cfc-field cfc-field-wide">
                      <label>Audiences</label>
                      <input
                        className="text-input"
                        value={c.audiences.join(", ")}
                        onChange={(e) => updateCampaign(c.id, { audiences: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      />
                    </div>
                    <div className="cfc-field cfc-field-wide">
                      <label>Negative keywords</label>
                      <input
                        className="text-input"
                        value={c.negatives.join(", ")}
                        onChange={(e) => updateCampaign(c.id, { negatives: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {archSub === "review" && (
            <div className="substage-content wide">
              <div className="substage-intro">
                <h2>Review</h2>
                <p>Final architecture overview. Move to Generate when this looks right.</p>
              </div>
              <div className="arch-canvas">
                {campaigns.map((c) => (
                  <div key={c.id} className="campaign-col">
                    <div className="campaign-col-header">
                      <div className="campaign-col-h-row1">
                        <span className="accent-bar" style={{ background: c.accent }} />
                        <span className="campaign-name-input">{c.name}</span>
                      </div>
                      <div className="campaign-col-h-row2">
                        <span className="kw-match phrase">{c.structure}</span>
                        <span className="kw-match exact">{c.channelType}</span>
                        <span className="arch-stat">${c.budget}/d</span>
                      </div>
                    </div>
                    <div className="campaign-col-stats">
                      <span className="campaign-col-stat"><strong>{c.adGroups.length}</strong> groups</span>
                      <span className="campaign-col-stat"><strong>{c.adGroups.reduce((s, g) => s + g.keywords.length, 0)}</strong> kw</span>
                    </div>
                    <div className="campaign-col-body">
                      {c.adGroups.map((g) => (
                        <div key={g.id} className="adgroup-card">
                          <div className="adgroup-h">
                            <span className="adgroup-name">{g.name}</span>
                          </div>
                          <div className="adgroup-meta">
                            <span>{g.keywords.length} kw</span>
                            <span>{g.landingPath}</span>
                          </div>
                          <div className="kw-list">
                            {g.keywords.slice(0, 8).map((k) => (
                              <span key={k.id} className="kw-chip">
                                <span className={classNames(
                                  "kw-match",
                                  k.match === "PHR" && "phrase",
                                  k.match === "EXC" && "exact",
                                  k.match === "BRD" && "broad"
                                )}>
                                  {k.match}
                                </span>
                                <span className="kw-text">{k.text}</span>
                              </span>
                            ))}
                            {g.keywords.length > 8 && <span className="kw-chip"><span className="kw-text">+{g.keywords.length - 8} more</span></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="action-row">
                <span className="summary">
                  <strong>{campaigns.length}</strong> campaigns ·{" "}
                  <strong>{campaigns.reduce((s, c) => s + c.adGroups.length, 0)}</strong> ad groups ·{" "}
                  <strong>{campaigns.reduce((s, c) => s + c.adGroups.reduce((s2, g) => s2 + g.keywords.length, 0), 0)}</strong> keywords
                </span>
                <button className="btn primary" onClick={() => setStage("generate")}>Generate copy →</button>
              </div>
            </div>
          )}
        </div>

        {/* ----- GENERATE VIEW ----- */}
        <div className={classNames("view", stage === "generate" && "active")}>
          {!campaigns.length ? (
            <div className="brief-empty-state">
              <strong>No architecture yet</strong>
              Go back to Architect and propose campaigns first.
            </div>
          ) : (
            <>
              <div className="stage-header">
                <div>
                  <p className="stage-eyebrow">Stage 03 / Generate</p>
                  <h1 className="stage-title">Generate <em>RSA copy</em></h1>
                  <p className="stage-sub">15 headlines, 5 descriptions, 2 paths, 6 sitelinks per ad group. H1 is DKI.</p>
                </div>
              </div>

              <div className="gen-shell">
                <div>
                  {active && (
                    <>
                      <div className="gen-active-h">
                        <div>
                          <div className="gen-active-name">{active.ag.name}</div>
                          <div className="gen-active-meta">{active.campaign.name}</div>
                        </div>
                        <button
                          className="btn ai"
                          onClick={() => handleGenerateCopy(active.campaign, active.ag)}
                          disabled={!!loading}
                        >
                          {active.ag.copy ? "Regenerate copy" : "Generate copy"}
                        </button>
                      </div>

                      {active.ag.copy ? (
                        <>
                          <div className="gen-section-title">Headlines (15)</div>
                          {active.ag.copy.headlines.map((h, i) => (
                            <div key={i} className="asset-row">
                              <span className="asset-num">H{i + 1}</span>
                              <input
                                className={classNames("asset-text-input", h.overLimit && "over")}
                                value={h.text}
                                onChange={(e) => setHeadlineText(active.campaign.id, active.ag.id, i, e.target.value)}
                              />
                              <span className={classNames("asset-len", (h.length ?? 0) > 25 && "warn", h.overLimit && "over")}>
                                {dkiVisible(h.text).length}/30
                              </span>
                              <span className={classNames("asset-angle", h.angle)}>
                                {h.angle}{h.pin != null ? ` p${h.pin}` : ""}
                              </span>
                            </div>
                          ))}

                          <div className="gen-section-title">Descriptions (5)</div>
                          {active.ag.copy.descriptions.map((d, i) => (
                            <div key={i} className="asset-row">
                              <span className="asset-num">D{i + 1}</span>
                              <input
                                className={classNames("asset-text-input", d.overLimit && "over")}
                                value={d.text}
                                onChange={(e) => setDescriptionText(active.campaign.id, active.ag.id, i, e.target.value)}
                              />
                              <span className={classNames("asset-len", (d.length ?? 0) > 80 && "warn", d.overLimit && "over")}>
                                {(d.text || "").length}/90
                              </span>
                              <span className={classNames("asset-angle", d.angle)}>{d.angle}</span>
                            </div>
                          ))}

                          <div className="gen-section-title">Display paths</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              className="text-input"
                              placeholder="Path 1"
                              value={active.ag.copy.paths[0] || ""}
                              onChange={(e) => setPathText(active.campaign.id, active.ag.id, 0, e.target.value)}
                            />
                            <input
                              className="text-input"
                              placeholder="Path 2"
                              value={active.ag.copy.paths[1] || ""}
                              onChange={(e) => setPathText(active.campaign.id, active.ag.id, 1, e.target.value)}
                            />
                          </div>

                          <div className="gen-section-title">Sitelinks (6)</div>
                          {active.ag.copy.sitelinks.map((s, i) => (
                            <div key={i} className="sitelink-row">
                              <strong>{s.text}</strong>
                              <span className="sl-d">{s.desc1}</span>
                              <span className="sl-d">{s.desc2}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="brief-empty-state">
                          <strong>No copy generated yet</strong>
                          Hit "Generate copy" to create 15 headlines, 5 descriptions, 2 paths, and 6 sitelinks for this ad group.
                        </div>
                      )}
                    </>
                  )}
                </div>

                <aside className="gen-side">
                  <div className="label-mono">Ad groups</div>
                  <div className="gen-adgroup-list">
                    {allAdGroups.map(({ ag: g, key }) => (
                      <button
                        key={key}
                        className={classNames("gen-adgroup-pill", activeAdGroupKey === key && "active")}
                        onClick={() => setActiveAdGroupKey(key)}
                      >
                        <span>{g.name}</span>
                        <span className="meta">{g.copy ? "✓" : `${g.keywords.length}kw`}</span>
                      </button>
                    ))}
                  </div>
                  {active?.ag.copy && (
                    <>
                      <div className="label-mono">SERP preview</div>
                      <div className="serp-card">
                        <div className="serp-source">
                          <div className="serp-favicon">{(safeHost(briefUrl) || "B").charAt(0).toUpperCase()}</div>
                          <div className="serp-source-text">
                            <span className="serp-sponsored">Sponsored</span>
                            <span className="serp-domain">{safeHost(briefUrl)} <span className="url-rest">› {active.ag.copy.paths[0]}</span></span>
                          </div>
                        </div>
                        <div className="serp-headline">
                          {active.ag.copy.headlines.slice(0, 3).map((h) => dkiVisible(h.text)).join(" · ")}
                        </div>
                        <p className="serp-desc">{active.ag.copy.descriptions[0]?.text || ""}</p>
                      </div>
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>

        {/* ----- CLIENT REVIEW VIEW ----- */}
        <div className={classNames("view", stage === "review" && "active")}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 04 / Client review</p>
              <h1 className="stage-title">Send for <em>client review</em></h1>
              <p className="stage-sub">Generate a white-label review link. The client sees variation cards with SERP previews and can approve or leave notes per variation.</p>
            </div>
          </div>
          <div className="brief">
            <button className="btn primary" onClick={handleGenerateReviewLink} disabled={!campaigns.length}>
              Generate review link →
            </button>
            {!campaigns.length && (
              <p className="text-helper" style={{ marginTop: 12 }}>You need to architect a build first.</p>
            )}
          </div>
        </div>
      </main>

      {/* ----- STATUS BAR ----- */}
      <div className="status-bar">
        <span className="status-section"><span className={classNames("status-dot", health === "ok" && "ok")} /> {health === "ok" ? "Live" : health}</span>
        <span className="status-section">Stage <strong>{stage}</strong></span>
        <span className="status-section spacer" />
        <span className="status-section">v0.2 · BRAIVE Ads</span>
      </div>

      {/* ----- LOADING OVERLAY ----- */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner" />
            <div>
              <div className="loading-text">{loading.message}</div>
              {loading.sub && <span className="loading-text-mono">{loading.sub}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ----- PERSISTENT ERROR BANNER ----- */}
      {error && (
        <div className="error-banner">
          <div className="error-banner-h">
            <span className="error-banner-tag">ERROR</span>
            <span className="error-banner-msg">{error.message}</span>
            <button
              className="btn sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify({ message: error.message, debug: error.debug }, null, 2));
                setToast({ type: "success", message: "Debug copied" });
              }}
            >
              Copy debug
            </button>
            <button className="btn sm ghost" onClick={() => setDebugOpen((o) => !o)}>
              {debugOpen ? "Hide" : "Show"} JSON
            </button>
            <button className="btn sm ghost" onClick={() => setError(null)}>×</button>
          </div>
          {debugOpen && (
            <pre className="error-banner-json">
              {JSON.stringify({ message: error.message, debug: error.debug }, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ----- TOAST ----- */}
      {toast && <div className={classNames("toast", toast.type)}>{toast.message}</div>}

      {/* ----- REVIEW LINK MODAL ----- */}
      {reviewModal.open && reviewModal.url && (
        <div className="modal-overlay" onClick={() => setReviewModal({ open: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <strong>Review link generated</strong>
              <button className="btn sm ghost" onClick={() => setReviewModal({ open: false })}>×</button>
            </div>
            <p className="modal-sub">
              Send this link to the client. The session is stored locally on the device that opens it - works best when the client opens it on this same device for the demo.
            </p>
            <div className="modal-link">{reviewModal.url}</div>
            <div className="modal-actions">
              <button
                className="btn primary"
                onClick={() => {
                  navigator.clipboard.writeText(reviewModal.url || "");
                  setToast({ type: "success", message: "Link copied" });
                }}
              >
                Copy link
              </button>
              <button
                className="btn"
                onClick={() => window.open(reviewModal.url, "_blank")}
              >
                Open in new tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
