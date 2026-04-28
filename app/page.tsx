"use client";

import { useState, useEffect, useRef, useMemo } from "react";

// ============= TYPES =============
type MatchType = "phrase" | "exact" | "broad";
type Structure = "MKAG" | "SKAG" | "STAG" | "Hagakure" | "Custom";
type ChannelType = "Search" | "PMax" | "Demand";
type Stage = "brief" | "architect" | "generate" | "review";
type ArchSubStage = "campaigns" | "keywords" | "targeting" | "review";
type BidStrategy = "Max conversions" | "Max conversion value" | "Target CPA" | "Target ROAS" | "Max clicks" | "Manual CPC";
type Angle = "benefit" | "usp" | "urgency" | "proof" | "qualifier" | "cta";

interface Keyword { text: string; match: MatchType; }
interface AdGroup { id: string; name: string; aiNote: string | null; keywords: Keyword[]; landingPath?: string; copy?: AdGroupCopy; }
interface AdGroupCopy { headlines: Headline[]; descriptions: Description[]; paths: string[]; sitelinks: Sitelink[]; }
interface Headline { id: string; text: string; angle: Angle; pin: number | null; length: number; overLimit: boolean; status: string; }
interface Description { id: string; text: string; angle: Angle; length: number; overLimit: boolean; status: string; }
interface Sitelink { id: string; title: string; desc1: string; desc2: string; }
interface Campaign {
  id: string; name: string; structure: Structure; channelType: ChannelType;
  accent: string; budget: number; locations: string[]; bidStrategy: BidStrategy;
  audiences: string[]; negatives: string;
  aiNote: string | null; adGroups: AdGroup[];
}
interface BrandFingerprint { toneOfVoice: string; targetAudience: string; usps: string[]; mustIncludeKeywords: string[]; }
interface AnglePair { title: string; description: string; }
interface BriefData { url: string; pagesScraped: number; brand: BrandFingerprint; angles: { pain: AnglePair[]; aspiration: AnglePair[]; }; recommendedLean: number; }

const matchTypeOrder: MatchType[] = ["phrase", "exact", "broad"];
const matchLabels: Record<MatchType, string> = { phrase: "PHR", exact: "EXC", broad: "BRD" };
const structDescs: Record<Structure, string> = {
  MKAG: "Themed ad groups, multiple keywords per group.",
  SKAG: "Single Keyword Ad Group. Maximum control.",
  STAG: "Single Theme Ad Group. 5–15 tightly related keywords.",
  Hagakure: "Broad ad groups, lean on smart bidding.",
  Custom: "Define your own naming & grouping rules.",
};
const channelTypeDescs: Record<ChannelType, string> = { Search: "Keyword RSAs", PMax: "Cross-network", Demand: "YouTube + Discover" };
const bidStrategies: BidStrategy[] = ["Max conversions", "Max conversion value", "Target CPA", "Target ROAS", "Max clicks", "Manual CPC"];

// ============= MAIN =============
export default function Page() {
  const [stage, setStage] = useState<Stage>("brief");
  const [archSub, setArchSub] = useState<ArchSubStage>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Brief state
  const [briefUrl, setBriefUrl] = useState("https://gjgardner.com.au");
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [leanValue, setLeanValue] = useState(35);
  const [channels, setChannels] = useState({ search: true, pmax: true, demand: false });

  // Loading + toast
  const [loading, setLoading] = useState<{ msg: string; sub?: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);

  // Generate stage
  const [activeAdGroupKey, setActiveAdGroupKey] = useState<string | null>(null);
  const [previewCombo, setPreviewCombo] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => { if (paletteOpen) setTimeout(() => paletteInputRef.current?.focus(), 50); }, [paletteOpen]);

  const showToast = (msg: string, type: "error" | "success" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============= API CALLS =============
  const scrapeUrl = async () => {
    if (!briefUrl) { showToast("Enter a URL first"); return; }
    setLoading({ msg: "Scraping site...", sub: "fetching pages, extracting brand voice, finding angles" });
    try {
      const res = await fetch("/api/scrape-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: briefUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");
      setBrief(data);
      setLeanValue(data.recommendedLean ?? 35);
      showToast(`Scraped ${data.pagesScraped} pages`, "success");
    } catch (err: any) {
      showToast(err.message);
    } finally { setLoading(null); }
  };

  const proposeArchitecture = async () => {
    if (!brief) { showToast("Run the scrape first"); return; }
    setLoading({ msg: "Architecting account...", sub: "campaigns, ad groups, keywords, audiences" });
    try {
      const res = await fetch("/api/propose-architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: brief.url,
          brand: brief.brand,
          angles: brief.angles,
          leanPercent: leanValue,
          channels,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Propose failed");
      setCampaigns(data.campaigns);
      setStage("architect");
      setArchSub("campaigns");
      showToast(`Proposed ${data.campaigns.length} campaigns`, "success");
    } catch (err: any) {
      showToast(err.message);
    } finally { setLoading(null); }
  };

  const generateCopy = async (cid: string, aid: string) => {
    const c = campaigns.find(x => x.id === cid);
    const ag = c?.adGroups.find(a => a.id === aid);
    if (!c || !ag || !brief) return;
    setLoading({ msg: `Writing RSA copy...`, sub: `${ag.name} · 15 headlines, 5 descriptions, sitelinks` });
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brief.brand,
          angles: brief.angles,
          leanPercent: leanValue,
          campaign: { name: c.name, structure: c.structure },
          adGroup: { name: ag.name, keywords: ag.keywords, landingPath: ag.landingPath },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate failed");
      setCampaigns(prev => prev.map(c2 => c2.id !== cid ? c2 : {
        ...c2,
        adGroups: c2.adGroups.map(ag2 => ag2.id !== aid ? ag2 : { ...ag2, copy: data })
      }));
      setActiveAdGroupKey(`${cid}::${aid}`);
      showToast(`Generated copy for ${ag.name}`, "success");
    } catch (err: any) {
      showToast(err.message);
    } finally { setLoading(null); }
  };

  const generateAllCopy = async () => {
    if (!brief) return;
    const total = campaigns.reduce((s, c) => s + c.adGroups.length, 0);
    let done = 0;
    for (const c of campaigns) {
      for (const ag of c.adGroups) {
        if (ag.copy) { done++; continue; }
        setLoading({ msg: `Writing RSA copy ${done + 1}/${total}...`, sub: ag.name });
        try {
          const res = await fetch("/api/generate-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brand: brief.brand,
              angles: brief.angles,
              leanPercent: leanValue,
              campaign: { name: c.name, structure: c.structure },
              adGroup: { name: ag.name, keywords: ag.keywords, landingPath: ag.landingPath },
            }),
          });
          const data = await res.json();
          if (res.ok) {
            const cidLocal = c.id, aidLocal = ag.id;
            setCampaigns(prev => prev.map(c2 => c2.id !== cidLocal ? c2 : {
              ...c2,
              adGroups: c2.adGroups.map(ag2 => ag2.id !== aidLocal ? ag2 : { ...ag2, copy: data })
            }));
          }
        } catch {}
        done++;
      }
    }
    setLoading(null);
    // pick first ad group as active
    const first = campaigns[0]?.adGroups[0];
    if (first) setActiveAdGroupKey(`${campaigns[0].id}::${first.id}`);
    setStage("generate");
    showToast(`Generated copy for ${total} ad groups`, "success");
  };

  // ============= MUTATIONS =============
  const updateCampaign = (cid: string, fn: (c: Campaign) => Campaign) =>
    setCampaigns(prev => prev.map(c => c.id === cid ? fn(c) : c));
  const setStructure = (cid: string, s: Structure) => {
    updateCampaign(cid, c => {
      let adGroups = c.adGroups;
      if (s === "SKAG" && adGroups.length > 0) {
        adGroups = adGroups.flatMap(ag => ag.keywords.map(kw => ({
          id: `ag_${Math.random().toString(36).slice(2, 8)}`,
          name: `${kw.text} | SKAG`, aiNote: null, landingPath: ag.landingPath,
          keywords: [kw],
        })));
      }
      return { ...c, structure: s, adGroups };
    });
  };
  const setChannelType = (cid: string, ct: ChannelType) => updateCampaign(cid, c => ({ ...c, channelType: ct }));
  const cycleMatch = (cid: string, aid: string, kwIdx: number) => updateCampaign(cid, c => ({
    ...c, adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : {
      ...ag, keywords: ag.keywords.map((kw, i) => i !== kwIdx ? kw : { ...kw, match: matchTypeOrder[(matchTypeOrder.indexOf(kw.match) + 1) % 3] })
    })
  }));
  const removeKw = (cid: string, aid: string, kwIdx: number) => updateCampaign(cid, c => ({
    ...c, adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : { ...ag, keywords: ag.keywords.filter((_, i) => i !== kwIdx) })
  }));
  const addKwViaInput = (cid: string, aid: string, text: string) => {
    if (!text.trim()) return;
    updateCampaign(cid, c => ({
      ...c, adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : { ...ag, keywords: [...ag.keywords, { text: text.trim(), match: "phrase" }] })
    }));
  };
  const addAdGroup = (cid: string) => updateCampaign(cid, c => ({
    ...c, adGroups: [...c.adGroups, { id: `ag_new_${Math.random().toString(36).slice(2, 8)}`, name: `New ad group | ${c.structure}`, aiNote: null, keywords: [] }]
  }));
  const removeAdGroup = (cid: string, aid: string) => updateCampaign(cid, c => ({ ...c, adGroups: c.adGroups.filter(ag => ag.id !== aid) }));
  const addCampaign = () => setCampaigns(prev => [...prev, {
    id: `cm_new_${Math.random().toString(36).slice(2, 8)}`, name: "New campaign | SD",
    structure: "MKAG", channelType: "Search", accent: "#7A7A85",
    budget: 1000, locations: ["All locations"], bidStrategy: "Max clicks",
    audiences: [], negatives: "", aiNote: null, adGroups: [],
  }]);
  const removeCampaign = (cid: string) => setCampaigns(prev => prev.filter(c => c.id !== cid));
  const updateField = <K extends keyof Campaign>(cid: string, field: K, value: Campaign[K]) =>
    updateCampaign(cid, c => ({ ...c, [field]: value }));
  const updateAdGroupField = <K extends keyof AdGroup>(cid: string, aid: string, field: K, value: AdGroup[K]) =>
    updateCampaign(cid, c => ({ ...c, adGroups: c.adGroups.map(ag => ag.id === aid ? { ...ag, [field]: value } : ag) }));
  const addAudience = (cid: string, l: string) => l.trim() && updateCampaign(cid, c => ({ ...c, audiences: [...c.audiences, l.trim()] }));
  const removeAudience = (cid: string, i: number) => updateCampaign(cid, c => ({ ...c, audiences: c.audiences.filter((_, x) => x !== i) }));
  const addLocation = (cid: string, l: string) => l.trim() && updateCampaign(cid, c => ({ ...c, locations: [...c.locations, l.trim()] }));
  const removeLocation = (cid: string, i: number) => updateCampaign(cid, c => ({ ...c, locations: c.locations.filter((_, x) => x !== i) }));
  const updateHeadline = (cid: string, aid: string, hi: number, text: string) => updateCampaign(cid, c => ({
    ...c, adGroups: c.adGroups.map(ag => {
      if (ag.id !== aid || !ag.copy) return ag;
      const headlines = ag.copy.headlines.map((h, i) => i !== hi ? h : { ...h, text, length: text.length, overLimit: text.length > 30 });
      return { ...ag, copy: { ...ag.copy, headlines } };
    })
  }));
  const updateDescription = (cid: string, aid: string, di: number, text: string) => updateCampaign(cid, c => ({
    ...c, adGroups: c.adGroups.map(ag => {
      if (ag.id !== aid || !ag.copy) return ag;
      const descriptions = ag.copy.descriptions.map((d, i) => i !== di ? d : { ...d, text, length: text.length, overLimit: text.length > 90 });
      return { ...ag, copy: { ...ag.copy, descriptions } };
    })
  }));

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  // ============= COMPUTED =============
  const totalAG = campaigns.reduce((s, c) => s + c.adGroups.length, 0);
  const totalKW = campaigns.reduce((s, c) => s + c.adGroups.reduce((s2, ag) => s2 + ag.keywords.length, 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const stages: Stage[] = ["brief", "architect", "generate", "review"];
  const stageIdx = stages.indexOf(stage);
  const archSubStages: ArchSubStage[] = ["campaigns", "keywords", "targeting", "review"];
  const archSubIdx = archSubStages.indexOf(archSub);
  const archSubMeta: Record<ArchSubStage, { title: string; sub: string }> = {
    campaigns: { title: "Campaigns", sub: "Name & structure" },
    keywords: { title: "Keywords", sub: "Group & match" },
    targeting: { title: "Targeting", sub: "Budget & audience" },
    review: { title: "Review", sub: "Confirm & generate" },
  };

  const briefDone = !!brief;
  const architectDone = campaigns.length > 0;
  const generateDone = campaigns.some(c => c.adGroups.some(ag => ag.copy));

  const buildName = useMemo(() => {
    if (brief?.url) {
      try { return new URL(brief.url).hostname.replace("www.", ""); } catch { return "current build"; }
    }
    return "current build";
  }, [brief?.url]);

  // Active ad group for Generate stage
  const activeAdGroup = useMemo(() => {
    if (!activeAdGroupKey) return null;
    const [cid, aid] = activeAdGroupKey.split("::");
    const c = campaigns.find(x => x.id === cid);
    if (!c) return null;
    const ag = c.adGroups.find(x => x.id === aid);
    if (!ag) return null;
    return { campaign: c, adGroup: ag };
  }, [activeAdGroupKey, campaigns]);

  // SERP preview combo
  const previewCard = useMemo(() => {
    if (!activeAdGroup?.adGroup.copy) return null;
    const { headlines, descriptions } = activeAdGroup.adGroup.copy;
    const seed = previewCombo;
    const h1 = headlines.find(h => h.pin === 1) || headlines[0];
    const others = headlines.filter(h => h.pin !== 1);
    const h2 = others[seed % others.length] || headlines[1];
    const h3 = others[(seed + 3) % others.length] || headlines[2];
    const d1 = descriptions[seed % descriptions.length];
    const d2 = descriptions[(seed + 1) % descriptions.length];
    return {
      headline: [h1, h2, h3].filter(Boolean).map(h => {
        const m = h.text.match(/^\{KeyWord:([^}]+)\}$/);
        return m ? m[1] : h.text;
      }).join(" · "),
      description: [d1?.text, d2?.text].filter(Boolean).join(" "),
    };
  }, [activeAdGroup, previewCombo]);

  return (
    <div className="app-layout">
      {/* SIDEBAR — current build's stages */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"></div>
          <div className="brand-text"><span className="brand-name">BRAIVE</span><span className="brand-product">Ads</span></div>
        </div>

        <div className="nav-section">
          <button className="nav-item"><span className="nav-icon">⌂</span>Home<span className="nav-shortcut">⌘1</span></button>
          <button className="nav-item"><span className="nav-icon">▣</span>Brands</button>
        </div>

        <div className="nav-section">
          <p className="nav-label">{buildName}</p>
          <div className="sidebar-stage-nav">
            <button className={`stage-nav-item ${stage === "brief" ? "active" : briefDone ? "done" : ""}`} onClick={() => setStage("brief")}>
              <span className="stage-nav-num">1</span><span style={{ flex: 1 }}>Brief</span>
            </button>
            <button className={`stage-nav-item ${stage === "architect" ? "active" : architectDone ? "done" : ""}`} onClick={() => architectDone && setStage("architect")} disabled={!architectDone}>
              <span className="stage-nav-num">2</span><span style={{ flex: 1, opacity: !architectDone ? 0.5 : 1 }}>Architect</span>
            </button>
            {stage === "architect" && architectDone && (
              <div className="stage-nav-substages">
                {archSubStages.map((s, i) => (
                  <button key={s} className={`substage-nav-item ${archSub === s ? "active" : i < archSubIdx ? "done" : ""}`} onClick={() => setArchSub(s)}>
                    <span className="substage-nav-dot"></span>
                    <span>{archSubMeta[s].title}</span>
                  </button>
                ))}
              </div>
            )}
            <button className={`stage-nav-item ${stage === "generate" ? "active" : generateDone ? "done" : ""}`} onClick={() => architectDone && setStage("generate")} disabled={!architectDone}>
              <span className="stage-nav-num">3</span><span style={{ flex: 1, opacity: !architectDone ? 0.5 : 1 }}>Generate</span>
            </button>
            <button className={`stage-nav-item ${stage === "review" ? "active" : ""}`} onClick={() => generateDone && setStage("review")} disabled={!generateDone}>
              <span className="stage-nav-num">4</span><span style={{ flex: 1, opacity: !generateDone ? 0.5 : 1 }}>Client review</span>
            </button>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">MT</div>
            <div><p className="user-name">Matt Travers</p><p className="user-org">BRAIVE</p></div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-segment">Brands</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-segment active">{buildName}</span>
          </div>
          <div className="topbar-search" onClick={() => setPaletteOpen(true)}>
            <span className="topbar-search-icon">⌕</span>
            <span className="topbar-search-text">Search or run command...</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="topbar-actions">
            {brief && <span className="ai-hint">AI · {brief.pagesScraped} pages scraped</span>}
            <button className="icon-btn">⚙</button>
          </div>
        </header>

        {/* BRIEF */}
        <div className={`view ${stage === "brief" ? "active" : ""}`}>
          <div className="brief">
            <div className="stage-header">
              <div>
                <p className="stage-eyebrow">Stage 01 · Brief</p>
                <h1 className="stage-title">Where do you want to <em>send traffic?</em></h1>
                <p className="stage-sub">One URL. We&apos;ll crawl it, extract brand voice, surface what you&apos;re up against, and propose strategic angles.</p>
              </div>
            </div>

            <div className="brief-input-row">
              <input className="text-input" type="url" value={briefUrl} onChange={e => setBriefUrl(e.target.value)} placeholder="https://yourdomain.com" />
              <button className="btn primary" onClick={scrapeUrl} disabled={!!loading}>Scrape site</button>
            </div>
            <p className="text-helper">Drop in any URL · we crawl up to 5 pages · 8s avg · powered by Claude Sonnet 4.6</p>

            {!brief && !loading && (
              <div className="brief-empty-state" style={{ marginTop: 16 }}>
                <strong>No brief yet</strong>
                Paste a URL above and click Scrape. Try gjgardner.com.au, movember.com, or any client site.
              </div>
            )}

            {brief && (
              <>
                <div className="brief-section">
                  <p className="label-mono">Brand fingerprint <span className="count ai">extracted from {brief.pagesScraped} pages</span></p>
                  <div className="fingerprint">
                    <div className="fp-cell"><p className="fp-cell-label">Tone of voice</p><p className="fp-cell-value">{brief.brand.toneOfVoice}</p></div>
                    <div className="fp-cell"><p className="fp-cell-label">Target audience</p><p className="fp-cell-value">{brief.brand.targetAudience}</p></div>
                    <div className="fp-cell">
                      <p className="fp-cell-label">USPs detected</p>
                      <div className="fp-tags">
                        {brief.brand.usps.map((u, i) => <span key={i} className="fp-tag">{u}<span className="x">×</span></span>)}
                        <button className="fp-tag-add">+ add</button>
                      </div>
                    </div>
                    <div className="fp-cell">
                      <p className="fp-cell-label">Must-include keywords</p>
                      <div className="fp-tags">
                        {brief.brand.mustIncludeKeywords.map((k, i) => <span key={i} className="fp-tag">{k}<span className="x">×</span></span>)}
                        <button className="fp-tag-add">+ add</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="brief-section">
                  <p className="label-mono">Strategic angles <span className="count">how we&apos;ll lean</span></p>
                  <div className="strategy-grid">
                    <div className="angle-col">
                      <h4>Pain points <em>what to push against</em></h4>
                      {brief.angles.pain.map((a, i) => (
                        <div key={i} className="angle-card pain"><p className="angle-card-title">{a.title}</p><p className="angle-card-desc">{a.description}</p></div>
                      ))}
                    </div>
                    <div className="angle-col">
                      <h4>Aspirations <em>what to lift toward</em></h4>
                      {brief.angles.aspiration.map((a, i) => (
                        <div key={i} className="angle-card aspire"><p className="angle-card-title">{a.title}</p><p className="angle-card-desc">{a.description}</p></div>
                      ))}
                    </div>
                  </div>
                  <div className="lean-card" style={{ marginTop: 10 }}>
                    <div className="lean-label">
                      <span className="lean-label-text">Lead with <em>pain or aspiration?</em></span>
                      <span className="lean-value">{leanValue}% pain · {100 - leanValue}% aspiration</span>
                    </div>
                    <div className="lean-slider">
                      <div className="lean-track"></div>
                      <div className="lean-thumb" style={{ left: `${leanValue}%` }}></div>
                      <input type="range" className="lean-input" min={0} max={100} value={leanValue} onChange={e => setLeanValue(parseInt(e.target.value))} />
                    </div>
                    <div className="lean-ends"><span className="pe">Problem-led</span><span className="ae">Aspiration-led</span></div>
                  </div>
                </div>

                <div className="brief-section">
                  <p className="label-mono">Channels for this build</p>
                  <div className="channel-grid">
                    <div className={`channel-card ${channels.search ? "checked" : ""}`} onClick={() => setChannels(c => ({ ...c, search: !c.search }))}>
                      <div className="channel-card-h"><span className="channel-card-name">Search</span><span className="channel-card-c"></span></div>
                      <p className="channel-card-desc">Keyword RSAs across Google search</p>
                    </div>
                    <div className={`channel-card ${channels.pmax ? "checked" : ""}`} onClick={() => setChannels(c => ({ ...c, pmax: !c.pmax }))}>
                      <div className="channel-card-h"><span className="channel-card-name">Performance Max</span><span className="channel-card-c"></span></div>
                      <p className="channel-card-desc">Cross-network with audience signals</p>
                    </div>
                    <div className={`channel-card ${channels.demand ? "checked" : ""}`} onClick={() => setChannels(c => ({ ...c, demand: !c.demand }))}>
                      <div className="channel-card-h"><span className="channel-card-name">Demand Gen</span><span className="channel-card-c"></span></div>
                      <p className="channel-card-desc">YouTube + Discover, image-led</p>
                    </div>
                  </div>
                </div>

                <div className="action-row">
                  <p className="summary">BRIEF READY · {brief.brand.usps.length} USPS · {brief.angles.pain.length}P+{brief.angles.aspiration.length}A ANGLES</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn ghost" onClick={scrapeUrl}>Re-scrape</button>
                    <button className="btn primary" onClick={proposeArchitecture} disabled={!!loading}>Propose architecture →</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ARCHITECT */}
        <div className={`view ${stage === "architect" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 02 · Account architecture</p>
              <h1 className="stage-title">Build your <em>account structure</em></h1>
              <p className="stage-sub">{campaigns.length} campaigns proposed by AI from your brief. Walk through the four sub-stages — every field below is editable.</p>
            </div>
          </div>

          <div className="arch-substages">
            {archSubStages.map((s, i) => (
              <button key={s} className={`arch-substage ${i === archSubIdx ? "active" : i < archSubIdx ? "done" : ""}`} onClick={() => setArchSub(s)}>
                <span className="arch-substage-num">{i + 1}</span>
                <span className="arch-substage-label">
                  <span className="arch-substage-title">{archSubMeta[s].title}</span>
                  <span className="arch-substage-sub">{archSubMeta[s].sub}</span>
                </span>
              </button>
            ))}
          </div>

          {archSub === "campaigns" && (
            <div className="substage-content">
              <div className="substage-intro">
                <h2>Define your campaigns</h2>
                <p>Each campaign targets one theme. Name it, pick the structure type, choose the channel.</p>
              </div>
              {campaigns.map((c, idx) => (
                <div key={c.id} className="form-card">
                  <div className="form-card-header">
                    <span className="form-card-num">{String(idx + 1).padStart(2, "0")}</span>
                    <span className="form-card-title">Campaign {idx + 1}</span>
                    <span className="form-card-meta">{c.adGroups.length} AG · ${c.budget.toLocaleString()}/mo</span>
                    <div className="form-card-actions">
                      {campaigns.length > 1 && <button className="form-card-action-btn" onClick={() => removeCampaign(c.id)} title="Remove">×</button>}
                    </div>
                  </div>
                  <div className="form-card-body">
                    <div className="form-stack">
                      <div className="form-field">
                        <label className="form-label">Campaign name <span className="optional">naming convention: Theme x Sub-theme | SD</span></label>
                        <input className="form-input" value={c.name} onChange={e => updateField(c.id, "name", e.target.value)} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Account structure</label>
                        <div className="segmented">
                          {(Object.keys(structDescs) as Structure[]).map(s => (
                            <button key={s} className={`segmented-opt ${c.structure === s ? "active" : ""}`} onClick={() => setStructure(c.id, s)}>
                              <span className="segmented-opt-label">{s}</span>
                              <span className="segmented-opt-sub">{s === "MKAG" ? "DEFAULT" : s === "SKAG" ? "1KW/AG" : s === "STAG" ? "5-15KW" : s === "Hagakure" ? "BROAD" : "CUSTOM"}</span>
                            </button>
                          ))}
                        </div>
                        <p className="form-help">{structDescs[c.structure]}</p>
                      </div>
                      <div className="form-field">
                        <label className="form-label">Channel</label>
                        <div className="segmented">
                          {(Object.keys(channelTypeDescs) as ChannelType[]).map(ct => (
                            <button key={ct} className={`segmented-opt ${c.channelType === ct ? "active" : ""}`} onClick={() => setChannelType(c.id, ct)}>
                              <span className="segmented-opt-label">{ct}</span>
                              <span className="segmented-opt-sub">{channelTypeDescs[ct]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {c.aiNote && (
                        <div className="ai-suggestion-strip">
                          <span className="ai-suggestion-strip-icon">↳</span>
                          <div className="ai-suggestion-strip-body"><strong>AI:</strong> {c.aiNote}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button className="add-row-btn" onClick={addCampaign}>+ Add another campaign</button>
            </div>
          )}

          {archSub === "keywords" && (
            <div className="substage-content">
              <div className="substage-intro">
                <h2>Group your keywords</h2>
                <p>Click a chip&apos;s match label (PHR/EXC/BRD) to cycle. Paste a list to add many at once.</p>
              </div>
              {campaigns.map((c, idx) => {
                const isCollapsed = collapsed.has(`kw_${c.id}`);
                return (
                  <div key={c.id} className={`form-card ${isCollapsed ? "collapsed" : ""}`}>
                    <div className="form-card-header">
                      <button className={`form-card-collapse-btn ${!isCollapsed ? "expanded" : ""}`} onClick={() => toggleCollapsed(`kw_${c.id}`)}>›</button>
                      <span className="form-card-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="form-card-title">{c.name}</span>
                      <span className="form-card-meta">{c.adGroups.length} AG · {c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0)} KW · {c.structure}</span>
                    </div>
                    <div className="form-card-body">
                      {c.adGroups.map(ag => (
                        <div key={ag.id} className="adgroup-form">
                          <div className="adgroup-form-header">
                            <input className="adgroup-form-name" value={ag.name} onChange={e => updateAdGroupField(c.id, ag.id, "name", e.target.value)} />
                            <span className="adgroup-form-meta">{ag.keywords.length} KW</span>
                            {c.adGroups.length > 1 && <button className="form-card-action-btn" onClick={() => removeAdGroup(c.id, ag.id)} title="Remove">×</button>}
                          </div>
                          <KeywordInput keywords={ag.keywords} onAdd={t => addKwViaInput(c.id, ag.id, t)} onRemove={i => removeKw(c.id, ag.id, i)} onCycle={i => cycleMatch(c.id, ag.id, i)} />
                          <div className="form-row col-2" style={{ marginTop: 10 }}>
                            <div className="form-field">
                              <label className="form-label">Landing path</label>
                              <input className="form-input" value={ag.landingPath || ""} onChange={e => updateAdGroupField(c.id, ag.id, "landingPath", e.target.value)} placeholder="/page-path" />
                            </div>
                          </div>
                          {ag.aiNote && (
                            <div className="ai-suggestion-strip">
                              <span className="ai-suggestion-strip-icon">↳</span>
                              <div className="ai-suggestion-strip-body"><strong>AI:</strong> {ag.aiNote}</div>
                            </div>
                          )}
                        </div>
                      ))}
                      <button className="add-row-btn" onClick={() => addAdGroup(c.id)}>+ Add ad group to this campaign</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {archSub === "targeting" && (
            <div className="substage-content">
              <div className="substage-intro">
                <h2>Targeting &amp; budget</h2>
                <p>AI pre-filled this from your brief. Adjust per campaign.</p>
              </div>
              {campaigns.map((c, idx) => {
                const isCollapsed = collapsed.has(`tg_${c.id}`);
                return (
                  <div key={c.id} className={`form-card ${isCollapsed ? "collapsed" : ""}`}>
                    <div className="form-card-header">
                      <button className={`form-card-collapse-btn ${!isCollapsed ? "expanded" : ""}`} onClick={() => toggleCollapsed(`tg_${c.id}`)}>›</button>
                      <span className="form-card-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="form-card-title">{c.name}</span>
                      <span className="form-card-meta">${c.budget.toLocaleString()}/mo · {c.bidStrategy}</span>
                    </div>
                    <div className="form-card-body">
                      <div className="form-stack">
                        <div className="form-row col-2">
                          <div className="form-field">
                            <label className="form-label">Monthly budget</label>
                            <div className="form-input-wrap">
                              <span className="form-input-prefix">$</span>
                              <input className="form-input with-prefix" type="number" value={c.budget} onChange={e => updateField(c.id, "budget", parseInt(e.target.value) || 0)} />
                            </div>
                          </div>
                          <div className="form-field">
                            <label className="form-label">Bid strategy</label>
                            <select className="form-input" value={c.bidStrategy} onChange={e => updateField(c.id, "bidStrategy", e.target.value as BidStrategy)}>
                              {bidStrategies.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="form-field">
                          <label className="form-label">Locations</label>
                          <ChipInput chips={c.locations} placeholder="Add a location, press Enter..." onAdd={l => addLocation(c.id, l)} onRemove={i => removeLocation(c.id, i)} />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Audience signals <span className="optional">help PMax find your customers</span></label>
                          <ChipInput chips={c.audiences} placeholder="Add an audience signal, press Enter..." onAdd={a => addAudience(c.id, a)} onRemove={i => removeAudience(c.id, i)} />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Campaign-level negatives <span className="optional">one per line</span></label>
                          <textarea className="form-textarea" value={c.negatives} onChange={e => updateField(c.id, "negatives", e.target.value)} rows={3} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {archSub === "review" && (
            <div className="substage-content wide">
              <div className="substage-intro">
                <h2>Review your architecture</h2>
                <p>Final check before generating ad copy.</p>
              </div>
              <div className="review-summary">
                <div className="review-stat"><p className="review-stat-label">Campaigns</p><p className="review-stat-value">{campaigns.length}</p><p className="review-stat-sub">{campaigns.map(c => c.channelType).join(" · ")}</p></div>
                <div className="review-stat"><p className="review-stat-label">Ad groups</p><p className="review-stat-value">{totalAG}</p><p className="review-stat-sub">across {campaigns.length} campaigns</p></div>
                <div className="review-stat"><p className="review-stat-label">Keywords</p><p className="review-stat-value">{totalKW}</p><p className="review-stat-sub">avg {(totalKW / Math.max(totalAG, 1)).toFixed(1)}/AG</p></div>
                <div className="review-stat"><p className="review-stat-label">Budget / mo</p><p className="review-stat-value">${(totalBudget / 1000).toFixed(0)}K</p><p className="review-stat-sub">${totalBudget.toLocaleString()} total</p></div>
              </div>
              <p className="label-mono" style={{ marginBottom: 8 }}>Account hierarchy</p>
              <div className="review-canvas">
                {campaigns.map(c => (
                  <div key={c.id} className="review-canvas-col">
                    <div className="review-canvas-col-header"><span className="accent-bar" style={{ background: c.accent }}></span><span className="review-canvas-col-name">{c.name.split("|")[0].trim()}</span></div>
                    <div className="review-canvas-col-stats">{c.structure} · {c.channelType} · ${c.budget.toLocaleString()}/mo · {c.adGroups.length}AG · {c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0)}KW</div>
                    {c.adGroups.map(ag => (
                      <div key={ag.id} className="review-canvas-ag"><p className="review-canvas-ag-name">{ag.name}</p><p className="review-canvas-ag-meta">{ag.keywords.length} KW · {ag.landingPath || "no path"}</p></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="action-row">
            <p className="summary">{campaigns.length} CAMPAIGNS · {totalAG} AD GROUPS · {totalKW} KEYWORDS · ${(totalBudget/1000).toFixed(0)}K/MO</p>
            <div style={{ display: "flex", gap: 6 }}>
              {archSubIdx > 0 ? (
                <button className="btn ghost" onClick={() => setArchSub(archSubStages[archSubIdx - 1])}>← {archSubMeta[archSubStages[archSubIdx - 1]].title}</button>
              ) : (
                <button className="btn ghost" onClick={() => setStage("brief")}>← Brief</button>
              )}
              {archSubIdx < archSubStages.length - 1 ? (
                <button className="btn primary" onClick={() => setArchSub(archSubStages[archSubIdx + 1])}>Next: {archSubMeta[archSubStages[archSubIdx + 1]].title} →</button>
              ) : (
                <button className="btn primary" onClick={generateAllCopy} disabled={!!loading}>Generate copy for all ad groups →</button>
              )}
            </div>
          </div>
        </div>

        {/* GENERATE */}
        <div className={`view ${stage === "generate" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 03 · Generate</p>
              <h1 className="stage-title">Edit your <em>RSA copy</em></h1>
              <p className="stage-sub">Pick an ad group on the left to edit its 15 headlines and 5 descriptions. Live SERP preview on the right.</p>
            </div>
          </div>

          <div className="gen-shell">
            <div>
              {/* Ad group picker */}
              <div className="gen-adgroup-list">
                {campaigns.map(c => c.adGroups.map(ag => {
                  const key = `${c.id}::${ag.id}`;
                  const isActive = activeAdGroupKey === key;
                  return (
                    <button key={key} className={`gen-adgroup-pill ${isActive ? "active" : ""}`} onClick={() => { setActiveAdGroupKey(key); if (!ag.copy) generateCopy(c.id, ag.id); }}>
                      <span className="accent-bar" style={{ background: c.accent, width: 12 }}></span>
                      <span style={{ fontWeight: 600 }}>{ag.name}</span>
                      <span className="meta">{ag.copy ? "✓ READY" : "GENERATE"}</span>
                    </button>
                  );
                }))}
              </div>

              {/* Active ad group editor */}
              {activeAdGroup ? (
                activeAdGroup.adGroup.copy ? (
                  <>
                    <div className="form-card">
                      <div className="form-card-header">
                        <span className="form-card-title">{activeAdGroup.adGroup.name}</span>
                        <span className="form-card-meta">{activeAdGroup.adGroup.copy.headlines.length} headlines · {activeAdGroup.adGroup.copy.descriptions.length} descriptions</span>
                        <div className="form-card-actions">
                          <button className="btn sm" onClick={() => generateCopy(activeAdGroup.campaign.id, activeAdGroup.adGroup.id)} disabled={!!loading}>↻ Regenerate</button>
                        </div>
                      </div>
                      <div className="form-card-body">
                        <p className="gen-section-title" style={{ marginTop: 0 }}>Headlines <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>{activeAdGroup.adGroup.copy.headlines.length}/15 · max 30 chars</span></p>
                        {activeAdGroup.adGroup.copy.headlines.map((h, i) => {
                          const lenClass = h.length > 30 ? "over" : h.length > 25 ? "warn" : "";
                          return (
                            <div key={h.id} className="asset-row">
                              <span className="asset-num">H{i + 1}{h.pin === 1 ? "📌" : ""}</span>
                              <input className={`asset-text-input ${h.length > 30 ? "over" : ""}`} value={h.text} onChange={e => updateHeadline(activeAdGroup.campaign.id, activeAdGroup.adGroup.id, i, e.target.value)} />
                              <span className={`asset-len ${lenClass}`}>{h.length}/30</span>
                              <span className={`asset-angle ${h.angle}`}>{h.angle}</span>
                            </div>
                          );
                        })}
                        <p className="gen-section-title">Descriptions <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>{activeAdGroup.adGroup.copy.descriptions.length}/5 · max 90 chars</span></p>
                        {activeAdGroup.adGroup.copy.descriptions.map((d, i) => {
                          const lenClass = d.length > 90 ? "over" : d.length > 80 ? "warn" : "";
                          return (
                            <div key={d.id} className="asset-row">
                              <span className="asset-num">D{i + 1}</span>
                              <input className={`asset-text-input ${d.length > 90 ? "over" : ""}`} value={d.text} onChange={e => updateDescription(activeAdGroup.campaign.id, activeAdGroup.adGroup.id, i, e.target.value)} />
                              <span className={`asset-len ${lenClass}`}>{d.length}/90</span>
                              <span className={`asset-angle ${d.angle}`}>{d.angle}</span>
                            </div>
                          );
                        })}
                        <p className="gen-section-title">Sitelinks · {activeAdGroup.adGroup.copy.sitelinks.length}</p>
                        {activeAdGroup.adGroup.copy.sitelinks.map((s, i) => (
                          <div key={s.id} className="asset-row" style={{ gridTemplateColumns: "12px 1fr 1fr 1fr" }}>
                            <span className="asset-num">SL{i + 1}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.title}</span>
                            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.desc1}</span>
                            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.desc2}</span>
                          </div>
                        ))}
                        <p className="gen-section-title">Paths</p>
                        <p style={{ fontFamily: "Geist Mono, monospace", fontSize: 12, color: "var(--ink-2)" }}>
                          {activeAdGroup.adGroup.landingPath} / <span style={{ color: "var(--accent)" }}>{activeAdGroup.adGroup.copy.paths[0]}</span> / <span style={{ color: "var(--accent)" }}>{activeAdGroup.adGroup.copy.paths[1]}</span>
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="brief-empty-state">
                    <strong>No copy yet for this ad group</strong>
                    Click the pill above to generate.
                  </div>
                )
              ) : (
                <div className="brief-empty-state">
                  <strong>Pick an ad group</strong>
                  Click a pill above to edit RSA copy.
                </div>
              )}
            </div>

            {/* Live preview */}
            <div className="gen-side">
              <p className="label-mono">Live SERP preview</p>
              {previewCard ? (
                <div className="serp-card">
                  <div className="serp-source">
                    <div className="serp-favicon">{buildName.charAt(0).toUpperCase()}</div>
                    <div className="serp-source-text">
                      <span className="serp-sponsored">Sponsored</span>
                      <span className="serp-domain">{buildName}<span className="url-rest">{activeAdGroup?.adGroup.landingPath || ""}</span></span>
                    </div>
                  </div>
                  <h3 className="serp-headline">{previewCard.headline}</h3>
                  <p className="serp-desc">{previewCard.description}</p>
                  <div className="serp-cycle-row">
                    <button className="serp-cycle-btn" onClick={() => setPreviewCombo(c => c + 1)}>↻ Cycle combo</button>
                    <span className="serp-meta" style={{ marginLeft: "auto" }}>combo #{previewCombo + 1}</span>
                  </div>
                </div>
              ) : (
                <div className="brief-empty-state">
                  <strong>Preview empty</strong>
                  Generate copy for an ad group to see the live preview.
                </div>
              )}
            </div>
          </div>

          <div className="action-row">
            <p className="summary">{campaigns.filter(c => c.adGroups.some(ag => ag.copy)).length}/{campaigns.length} CAMPAIGNS WITH COPY</p>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn ghost" onClick={() => setStage("architect")}>← Architect</button>
              <button className="btn primary" onClick={() => setStage("review")} disabled={!generateDone}>Send to client review →</button>
            </div>
          </div>
        </div>

        {/* CLIENT REVIEW STUB */}
        <div className={`view ${stage === "review" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 04 · Client review</p>
              <h1 className="stage-title">Interactive review <em>(coming soon)</em></h1>
              <p className="stage-sub">White-label, magic-link review page. Real SERP previews, cycle combinations, approve/comment per variation.</p>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="status-bar">
        <div className="status-section"><span className="status-dot ok"></span><span>BRAIVE</span><strong>{buildName}</strong></div>
        <div className="status-section"><span>STAGE</span><strong>{stage.toUpperCase()}{stage === "architect" ? ` · ${archSub.toUpperCase()}` : ""}</strong></div>
        <div className="status-section"><strong>{campaigns.length}</strong>CAM · <strong>{totalAG}</strong>AG · <strong>{totalKW}</strong>KW · <strong>${(totalBudget / 1000).toFixed(0)}K</strong>/MO</div>
        <div className="status-section spacer"></div>
        <div className="status-section">AI<strong style={{ color: "var(--ai)", marginLeft: 4 }}>READY</strong></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘K</span><span>palette</span></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘⏎</span><span>generate</span></div>
      </div>

      {/* PALETTE */}
      {paletteOpen && (
        <div className="palette-overlay open" onClick={e => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
          <div className="palette" onClick={e => e.stopPropagation()}>
            <div className="palette-input-row">
              <span className="palette-prompt">›</span>
              <input ref={paletteInputRef} className="palette-input" type="text" placeholder="Type a command, search, or ask AI..." />
              <span className="kbd">esc</span>
            </div>
            <p className="palette-section-label">Stages</p>
            <div className="palette-row" onClick={() => { setStage("brief"); setPaletteOpen(false); }}>
              <span className="palette-icon nav">1</span>
              <span className="palette-row-text"><span className="palette-row-title">Brief</span></span>
            </div>
            {architectDone && (
              <div className="palette-row" onClick={() => { setStage("architect"); setPaletteOpen(false); }}>
                <span className="palette-icon nav">2</span>
                <span className="palette-row-text"><span className="palette-row-title">Architect</span></span>
              </div>
            )}
            {architectDone && (
              <div className="palette-row" onClick={() => { setStage("generate"); setPaletteOpen(false); }}>
                <span className="palette-icon nav">3</span>
                <span className="palette-row-text"><span className="palette-row-title">Generate</span></span>
              </div>
            )}
            <p className="palette-section-label">Actions</p>
            <div className="palette-row" onClick={() => { scrapeUrl(); setPaletteOpen(false); }}>
              <span className="palette-icon ai">b</span>
              <span className="palette-row-text"><span className="palette-row-title">Re-scrape current URL</span></span>
            </div>
            {brief && (
              <div className="palette-row" onClick={() => { proposeArchitecture(); setPaletteOpen(false); }}>
                <span className="palette-icon ai">b</span>
                <span className="palette-row-text"><span className="palette-row-title">Re-propose architecture</span></span>
              </div>
            )}
            {architectDone && (
              <div className="palette-row" onClick={() => { generateAllCopy(); setPaletteOpen(false); }}>
                <span className="palette-icon ai">b</span>
                <span className="palette-row-text"><span className="palette-row-title">Generate copy for all ad groups</span></span>
                <span className="palette-row-shortcut">⌘⏎</span>
              </div>
            )}
            <div className="palette-footer">
              <span className="palette-footer-item"><span className="kbd">↑↓</span> nav</span>
              <span className="palette-footer-item"><span className="kbd">↵</span> select</span>
              <span className="palette-footer-item"><span className="kbd">esc</span> close</span>
            </div>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner"></div>
            <div>
              <div className="loading-text">{loading.msg}</div>
              {loading.sub && <span className="loading-text-mono">{loading.sub}</span>}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ============= REUSABLE: Keyword input =============
function KeywordInput({ keywords, onAdd, onRemove, onCycle }: {
  keywords: Keyword[]; onAdd: (text: string) => void; onRemove: (i: number) => void; onCycle: (i: number) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="form-field">
      <label className="form-label">Keywords <span className="optional">paste many at once or type one then Enter</span></label>
      <div className="chip-input">
        {keywords.map((kw, i) => (
          <span key={i} className="chip-input-tag">
            <span className={`kw-match ${kw.match}`} onClick={() => onCycle(i)} style={{ cursor: "pointer" }}>{matchLabels[kw.match]}</span>
            <span style={{ marginLeft: 4 }}>{kw.text}</span>
            <span className="x" onClick={() => onRemove(i)}>×</span>
          </span>
        ))}
        <input
          className="chip-input-text" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              const lines = text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
              lines.forEach(line => onAdd(line));
              setText("");
            }
          }}
          onPaste={e => {
            const pasted = e.clipboardData.getData("text");
            if (pasted.includes("\n") || pasted.includes(",")) {
              e.preventDefault();
              const lines = pasted.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
              lines.forEach(line => onAdd(line));
              setText("");
            }
          }}
          placeholder={keywords.length === 0 ? "Type a keyword or paste a list..." : "Add another..."}
        />
      </div>
    </div>
  );
}

// ============= REUSABLE: Chip input =============
function ChipInput({ chips, onAdd, onRemove, placeholder }: {
  chips: string[]; onAdd: (text: string) => void; onRemove: (i: number) => void; placeholder: string;
}) {
  const [text, setText] = useState("");
  return (
    <div className="chip-input">
      {chips.map((chip, i) => (
        <span key={i} className="chip-input-tag">
          <span>{chip}</span>
          <span className="x" onClick={() => onRemove(i)}>×</span>
        </span>
      ))}
      <input
        className="chip-input-text" value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(text); setText(""); } }}
        placeholder={chips.length === 0 ? placeholder : "Add another..."}
      />
    </div>
  );
}
