"use client";

import { useState, useEffect, useRef } from "react";

// ============= TYPES =============
type MatchType = "phrase" | "exact" | "broad";
type Structure = "MKAG" | "SKAG" | "STAG" | "Hagakure" | "Custom";
type ChannelType = "Search" | "PMax" | "Demand";
type Stage = "brief" | "architect" | "generate" | "review";
type ArchSubStage = "campaigns" | "keywords" | "targeting" | "review";
type BidStrategy = "Max conversions" | "Max conversion value" | "Target CPA" | "Target ROAS" | "Max clicks" | "Manual CPC";

interface Keyword { text: string; match: MatchType; }
interface AdGroup { id: string; name: string; aiNote: string | null; keywords: Keyword[]; landingPath?: string; }
interface Campaign {
  id: string; name: string; structure: Structure; channelType: ChannelType;
  accent: string; budget: number; locations: string[]; bidStrategy: BidStrategy;
  audiences: string[]; negatives: string;
  aiNote: string | null; adGroups: AdGroup[];
}

// ============= INITIAL DATA =============
const initialCampaigns: Campaign[] = [
  {
    id: "cm_generic", name: "Brisbane North x Generic | SD",
    structure: "MKAG", channelType: "PMax", accent: "#4A8C5C",
    budget: 4000, locations: ["Brisbane North"], bidStrategy: "Max conversions",
    audiences: ["In-market: new homes", "Life event: getting married", "Life event: new baby"],
    negatives: "free\nDIY\njobs\ncareers",
    aiNote: "Strong intent · highest forecasted volume",
    adGroups: [{
      id: "ag_g_general", name: "Generic | MKAG", aiNote: null,
      landingPath: "/custom-homes",
      keywords: [
        { text: "custom home builders", match: "phrase" },
        { text: "new home builders brisbane", match: "phrase" },
        { text: "house and land brisbane north", match: "phrase" },
        { text: "home builders near me", match: "phrase" },
        { text: "best home builders brisbane", match: "phrase" },
      ],
    }],
  },
  {
    id: "cm_display", name: "Brisbane North x Display Homes | SD",
    structure: "MKAG", channelType: "Search", accent: "#5C6FFF",
    budget: 2000, locations: ["Brisbane North + 25km"], bidStrategy: "Max clicks",
    audiences: ["In-market: new homes"],
    negatives: "free\ncheap\nhow to",
    aiNote: null,
    adGroups: [
      {
        id: "ag_d_display", name: "Display Homes | MKAG", aiNote: null,
        landingPath: "/display-homes",
        keywords: [
          { text: "display homes brisbane north", match: "phrase" },
          { text: "display home open today", match: "phrase" },
          { text: "visit display home brisbane", match: "phrase" },
        ],
      },
      {
        id: "ag_d_open", name: "Open House | MKAG",
        aiNote: "consolidate? overlaps with Display Homes",
        landingPath: "/display-homes",
        keywords: [
          { text: "open house this weekend brisbane", match: "phrase" },
          { text: "home builders open day", match: "broad" },
        ],
      },
    ],
  },
  {
    id: "cm_kdr", name: "Brisbane North x KDR | SD",
    structure: "STAG", channelType: "Search", accent: "#FF6B3D",
    budget: 2000, locations: ["Brisbane North"], bidStrategy: "Target CPA",
    audiences: ["In-market: new homes", "Custom: visited /knockdown-rebuild"],
    negatives: "DIY\ncheap\nrent",
    aiNote: "underbudgeted · ~120 searches/mo",
    adGroups: [
      {
        id: "ag_k_kdr", name: "Knockdown Rebuild | STAG", aiNote: null,
        landingPath: "/knockdown-rebuild",
        keywords: [
          { text: "knockdown rebuild brisbane", match: "phrase" },
          { text: "knock down rebuild cost", match: "phrase" },
          { text: "demolish and rebuild brisbane", match: "phrase" },
          { text: "knockdown rebuild near me", match: "exact" },
        ],
      },
      {
        id: "ag_k_demo", name: "Demolition + Rebuild | STAG", aiNote: null,
        landingPath: "/knockdown-rebuild",
        keywords: [
          { text: "demolition cost brisbane", match: "phrase" },
          { text: "house demolition company", match: "broad" },
        ],
      },
    ],
  },
];

const matchTypeOrder: MatchType[] = ["phrase", "exact", "broad"];
const matchLabels: Record<MatchType, string> = { phrase: "PHR", exact: "EXC", broad: "BRD" };
const structDescs: Record<Structure, string> = {
  MKAG: "Themed ad groups, multiple keywords per group.",
  SKAG: "Single Keyword Ad Group. Maximum control.",
  STAG: "Single Theme Ad Group. 5–15 tightly related keywords.",
  Hagakure: "Broad ad groups, lean on smart bidding.",
  Custom: "Define your own naming & grouping rules.",
};
const channelTypeDescs: Record<ChannelType, string> = {
  Search: "Keyword RSAs",
  PMax: "Cross-network",
  Demand: "YouTube + Discover",
};
const bidStrategies: BidStrategy[] = ["Max conversions", "Max conversion value", "Target CPA", "Target ROAS", "Max clicks", "Manual CPC"];

// ============= MAIN =============
export default function Page() {
  const [stage, setStage] = useState<Stage>("architect");
  const [archSub, setArchSub] = useState<ArchSubStage>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [leanValue, setLeanValue] = useState(35);
  const [channels, setChannels] = useState({ search: false, pmax: true, demand: false });
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

  useEffect(() => {
    if (paletteOpen) setTimeout(() => paletteInputRef.current?.focus(), 50);
  }, [paletteOpen]);

  const updateCampaign = (cid: string, fn: (c: Campaign) => Campaign) =>
    setCampaigns(prev => prev.map(c => c.id === cid ? fn(c) : c));

  const setStructure = (cid: string, s: Structure) => {
    updateCampaign(cid, c => {
      let adGroups = c.adGroups;
      if (s === "SKAG" && adGroups.length > 0) {
        adGroups = adGroups.flatMap(ag =>
          ag.keywords.map(kw => ({
            id: `ag_${Math.random().toString(36).slice(2, 8)}`,
            name: `${kw.text} | SKAG`,
            aiNote: null, landingPath: ag.landingPath,
            keywords: [kw],
          }))
        );
      }
      return { ...c, structure: s, adGroups };
    });
  };

  const setChannelType = (cid: string, ct: ChannelType) =>
    updateCampaign(cid, c => ({ ...c, channelType: ct }));

  const cycleMatch = (cid: string, aid: string, kwIdx: number) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : {
        ...ag,
        keywords: ag.keywords.map((kw, i) => i !== kwIdx ? kw : { ...kw, match: matchTypeOrder[(matchTypeOrder.indexOf(kw.match) + 1) % 3] })
      })
    }));
  };

  const removeKw = (cid: string, aid: string, kwIdx: number) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : { ...ag, keywords: ag.keywords.filter((_, i) => i !== kwIdx) })
    }));
  };

  const addKwViaInput = (cid: string, aid: string, text: string) => {
    if (!text.trim()) return;
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : { ...ag, keywords: [...ag.keywords, { text: text.trim(), match: "phrase" }] })
    }));
  };

  const addAdGroup = (cid: string) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: [...c.adGroups, {
        id: `ag_new_${Math.random().toString(36).slice(2, 8)}`,
        name: `New ad group | ${c.structure}`,
        aiNote: null, keywords: [],
      }]
    }));
  };

  const removeAdGroup = (cid: string, aid: string) =>
    updateCampaign(cid, c => ({ ...c, adGroups: c.adGroups.filter(ag => ag.id !== aid) }));

  const addCampaign = () => {
    setCampaigns(prev => [...prev, {
      id: `cm_new_${Math.random().toString(36).slice(2, 8)}`,
      name: "New campaign | SD",
      structure: "MKAG", channelType: "Search", accent: "#7A7A85",
      budget: 1000, locations: ["All locations"], bidStrategy: "Max clicks",
      audiences: [], negatives: "",
      aiNote: null, adGroups: [],
    }]);
  };

  const removeCampaign = (cid: string) => setCampaigns(prev => prev.filter(c => c.id !== cid));

  const updateField = <K extends keyof Campaign>(cid: string, field: K, value: Campaign[K]) =>
    updateCampaign(cid, c => ({ ...c, [field]: value }));

  const updateAdGroupField = <K extends keyof AdGroup>(cid: string, aid: string, field: K, value: AdGroup[K]) =>
    updateCampaign(cid, c => ({ ...c, adGroups: c.adGroups.map(ag => ag.id === aid ? { ...ag, [field]: value } : ag) }));

  const addAudience = (cid: string, l: string) => l.trim() && updateCampaign(cid, c => ({ ...c, audiences: [...c.audiences, l.trim()] }));
  const removeAudience = (cid: string, i: number) => updateCampaign(cid, c => ({ ...c, audiences: c.audiences.filter((_, x) => x !== i) }));
  const addLocation = (cid: string, l: string) => l.trim() && updateCampaign(cid, c => ({ ...c, locations: [...c.locations, l.trim()] }));
  const removeLocation = (cid: string, i: number) => updateCampaign(cid, c => ({ ...c, locations: c.locations.filter((_, x) => x !== i) }));

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"></div>
          <div className="brand-text"><span className="brand-name">BRAIVE</span><span className="brand-product">Ads</span></div>
        </div>
        <div className="nav-section">
          <button className="nav-item"><span className="nav-icon">⌂</span>Home<span className="nav-shortcut">⌘1</span></button>
          <button className="nav-item active"><span className="nav-icon">▣</span>Brands<span className="nav-shortcut">⌘2</span></button>
          <button className="nav-item"><span className="nav-icon">⊞</span>Templates</button>
          <button className="nav-item"><span className="nav-icon">⌬</span>Integrations</button>
        </div>
        <div className="nav-section">
          <p className="nav-label">Recent</p>
          <div className="recent-list">
            <div className="recent-item"><span className="recent-dot architect"></span><span className="recent-text">GJBON / Spring display</span></div>
            <div className="recent-item"><span className="recent-dot live"></span><span className="recent-text">Movember / Mo Bro 2026</span></div>
            <div className="recent-item"><span className="recent-dot live"></span><span className="recent-text">Rackley / Term 2 enrol</span></div>
            <div className="recent-item"><span className="recent-dot draft"></span><span className="recent-text">Minor / Easter long w/end</span></div>
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
            <span className="breadcrumb-segment">GJ Gardner BON</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-segment active">Spring display 2026</span>
          </div>
          <div className="topbar-search" onClick={() => setPaletteOpen(true)}>
            <span className="topbar-search-icon">⌕</span>
            <span className="topbar-search-text">Search or run command...</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="topbar-actions">
            <span className="ai-hint">AI ready · 3 suggestions</span>
            <button className="icon-btn">⚙</button>
          </div>
        </header>

        <nav className="stage-stepper">
          {stages.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center" }}>
              <button className={i === stageIdx ? "active" : i < stageIdx ? "done" : ""} onClick={() => setStage(s)}>
                <span className="stage-num">{i + 1}</span>
                {s === "review" ? "Client review" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
              {i < stages.length - 1 && <div className="stage-divider"></div>}
            </div>
          ))}
        </nav>

        {/* BRIEF (unchanged from v0.1) */}
        <div className={`view ${stage === "brief" ? "active" : ""}`}>
          <div className="brief">
            <div className="stage-header">
              <div>
                <p className="stage-eyebrow">Stage 01 · Brief</p>
                <h1 className="stage-title">Where do you want to <em>send traffic?</em></h1>
                <p className="stage-sub">One URL. We&apos;ll crawl it, extract brand voice, surface what you&apos;re up against, and propose landing pages.</p>
              </div>
            </div>
            <div className="brief-input-row">
              <input className="text-input" type="url" defaultValue="https://gjgardner.com.au" />
              <button className="btn primary">Scrape site</button>
            </div>
            <p className="text-helper">Or <a href="#" onClick={e => e.preventDefault()}>brief by voice</a> · 8s avg crawl · 4–6 sources synthesised</p>

            <div className="brief-section">
              <p className="label-mono">Brand fingerprint <span className="count ai">extracted</span></p>
              <div className="fingerprint">
                <div className="fp-cell"><p className="fp-cell-label">Tone of voice</p><p className="fp-cell-value">Trustworthy, family-focused, established. Conversational without being casual.</p></div>
                <div className="fp-cell"><p className="fp-cell-label">Target audience</p><p className="fp-cell-value">Families and first-home buyers building in Brisbane&apos;s outer northern suburbs.</p></div>
                <div className="fp-cell">
                  <p className="fp-cell-label">USPs detected</p>
                  <div className="fp-tags">
                    <span className="fp-tag">40+ years building<span className="x">×</span></span>
                    <span className="fp-tag">Local Brisbane<span className="x">×</span></span>
                    <span className="fp-tag">Custom designs<span className="x">×</span></span>
                    <span className="fp-tag">Free consult<span className="x">×</span></span>
                    <button className="fp-tag-add">+ add</button>
                  </div>
                </div>
                <div className="fp-cell">
                  <p className="fp-cell-label">Must-include keywords</p>
                  <div className="fp-tags">
                    <span className="fp-tag">custom homes<span className="x">×</span></span>
                    <span className="fp-tag">Brisbane north<span className="x">×</span></span>
                    <span className="fp-tag">house and land<span className="x">×</span></span>
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
                  <div className="angle-card pain"><p className="angle-card-title">Cost overruns mid-build</p><p className="angle-card-desc">Reviews cite fixed-price guarantees as the reason families chose GJ.</p></div>
                  <div className="angle-card pain"><p className="angle-card-title">Cookie-cutter project home designs</p><p className="angle-card-desc">Competitors lean on standard floorplans. Customisation is a wedge.</p></div>
                  <div className="angle-card pain"><p className="angle-card-title">Builders going broke before handover</p><p className="angle-card-desc">Industry concern. 40 years trading is a clear trust signal.</p></div>
                </div>
                <div className="angle-col">
                  <h4>Aspirations <em>what to lift toward</em></h4>
                  <div className="angle-card aspire"><p className="angle-card-title">A home that&apos;s actually theirs</p><p className="angle-card-desc">Customer stories mention the personalisation feeling collaborative.</p></div>
                  <div className="angle-card aspire"><p className="angle-card-title">Building a generational asset</p><p className="angle-card-desc">Long-term thinking sits in the brand voice. Worth amplifying.</p></div>
                  <div className="angle-card aspire"><p className="angle-card-title">Land that feels like the right place</p><p className="angle-card-desc">Brisbane outer north has identity - lifestyle, schools, room.</p></div>
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
              <p className="summary"><strong>3</strong> CAMPAIGNS PROPOSED · ~$0.18 API SPEND TO ARCHITECT</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn ghost">Save brief</button>
                <button className="btn primary" onClick={() => setStage("architect")}>Architect →</button>
              </div>
            </div>
          </div>
        </div>

        {/* ARCHITECT - METHODICAL SUB-STAGES */}
        <div className={`view ${stage === "architect" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 02 · Account architecture</p>
              <h1 className="stage-title">Build your <em>account structure</em></h1>
              <p className="stage-sub">Step through the four sub-stages. AI proposed a starting point — edit each section methodically. Every field below is editable.</p>
            </div>
          </div>

          <div className="arch-substages">
            {archSubStages.map((s, i) => (
              <button
                key={s}
                className={`arch-substage ${i === archSubIdx ? "active" : i < archSubIdx ? "done" : ""}`}
                onClick={() => setArchSub(s)}
              >
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
                <p>Each campaign targets one theme. Name it, pick the structure type, and choose the channel. You&apos;ll add keywords next.</p>
              </div>

              {campaigns.map((c, idx) => (
                <div key={c.id} className="form-card">
                  <div className="form-card-header">
                    <span className="form-card-num">{String(idx + 1).padStart(2, "0")}</span>
                    <span className="form-card-title">Campaign {idx + 1}</span>
                    <span className="form-card-meta">{c.adGroups.length} ad group{c.adGroups.length !== 1 ? "s" : ""} · ${c.budget.toLocaleString()}/mo</span>
                    <div className="form-card-actions">
                      {campaigns.length > 1 && <button className="form-card-action-btn" onClick={() => removeCampaign(c.id)} title="Remove campaign">×</button>}
                    </div>
                  </div>
                  <div className="form-card-body">
                    <div className="form-stack">
                      <div className="form-field">
                        <label className="form-label">Campaign name <span className="optional">naming convention: Theme x Sub-theme | SD</span></label>
                        <input className="form-input" value={c.name} onChange={e => updateField(c.id, "name", e.target.value)} placeholder="e.g. Brisbane North x Generic | SD" />
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
                          <div className="ai-suggestion-strip-body"><strong>AI note:</strong> {c.aiNote}</div>
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
                <p>For each ad group, add the keywords you want to target. Match types: <span style={{ fontFamily: "Geist Mono, monospace", color: "var(--accent)" }}>PHR</span> phrase, <span style={{ fontFamily: "Geist Mono, monospace", color: "var(--ai)" }}>EXC</span> exact, <span style={{ fontFamily: "Geist Mono, monospace", color: "var(--warning)" }}>BRD</span> broad. Click a chip&apos;s match label to cycle.</p>
              </div>

              {campaigns.map((c, idx) => {
                const isCollapsed = collapsed.has(`kw_${c.id}`);
                return (
                  <div key={c.id} className={`form-card ${isCollapsed ? "collapsed" : ""}`}>
                    <div className="form-card-header">
                      <button className={`form-card-collapse-btn ${!isCollapsed ? "expanded" : ""}`} onClick={() => toggleCollapsed(`kw_${c.id}`)}>›</button>
                      <span className="form-card-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="form-card-title">{c.name}</span>
                      <span className="form-card-meta">
                        {c.adGroups.length} AG · {c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0)} KW · {c.structure}
                      </span>
                    </div>
                    <div className="form-card-body">
                      {c.adGroups.map(ag => (
                        <div key={ag.id} className="adgroup-form">
                          <div className="adgroup-form-header">
                            <input className="adgroup-form-name" value={ag.name} onChange={e => updateAdGroupField(c.id, ag.id, "name", e.target.value)} />
                            <span className="adgroup-form-meta">{ag.keywords.length} KW</span>
                            {c.adGroups.length > 1 && <button className="form-card-action-btn" onClick={() => removeAdGroup(c.id, ag.id)} title="Remove ad group">×</button>}
                          </div>
                          <KeywordInput
                            keywords={ag.keywords}
                            onAdd={text => addKwViaInput(c.id, ag.id, text)}
                            onRemove={i => removeKw(c.id, ag.id, i)}
                            onCycle={i => cycleMatch(c.id, ag.id, i)}
                          />
                          <div className="form-row col-2" style={{ marginTop: 10 }}>
                            <div className="form-field">
                              <label className="form-label">Landing path</label>
                              <input className="form-input" value={ag.landingPath || ""} onChange={e => updateAdGroupField(c.id, ag.id, "landingPath", e.target.value)} placeholder="/page-path" />
                            </div>
                          </div>
                          {ag.aiNote && (
                            <div className="ai-suggestion-strip">
                              <span className="ai-suggestion-strip-icon">↳</span>
                              <div className="ai-suggestion-strip-body">
                                <strong>AI:</strong> {ag.aiNote}
                                <div className="ai-suggestion-strip-actions">
                                  <button className="ai-suggestion-strip-action">Apply</button>
                                  <button className="ai-suggestion-strip-action dismiss">Dismiss</button>
                                </div>
                              </div>
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
                <p>Per-campaign settings: budget, locations, bid strategy, audience signals, negatives. AI has pre-filled what it inferred from the brief.</p>
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
                          <textarea className="form-textarea" value={c.negatives} onChange={e => updateField(c.id, "negatives", e.target.value)} placeholder="free&#10;DIY&#10;jobs" rows={3} />
                          <p className="form-help ai">↳ AI detected 12 likely account-level negatives from your landing pages — review them in the side panel.</p>
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
                <p>Final check before generating ad copy. If anything looks off, jump back to a previous step.</p>
              </div>

              <div className="review-summary">
                <div className="review-stat">
                  <p className="review-stat-label">Campaigns</p>
                  <p className="review-stat-value">{campaigns.length}</p>
                  <p className="review-stat-sub">{campaigns.map(c => c.channelType).join(" · ")}</p>
                </div>
                <div className="review-stat">
                  <p className="review-stat-label">Ad groups</p>
                  <p className="review-stat-value">{totalAG}</p>
                  <p className="review-stat-sub">across {campaigns.length} campaigns</p>
                </div>
                <div className="review-stat">
                  <p className="review-stat-label">Keywords</p>
                  <p className="review-stat-value">{totalKW}</p>
                  <p className="review-stat-sub">avg {(totalKW / Math.max(totalAG, 1)).toFixed(1)}/ad group</p>
                </div>
                <div className="review-stat">
                  <p className="review-stat-label">Budget / mo</p>
                  <p className="review-stat-value">${(totalBudget / 1000).toFixed(0)}K</p>
                  <p className="review-stat-sub">${totalBudget.toLocaleString()} total</p>
                </div>
              </div>

              <p className="label-mono" style={{ marginBottom: 8 }}>Account hierarchy</p>
              <div className="review-canvas">
                {campaigns.map(c => (
                  <div key={c.id} className="review-canvas-col">
                    <div className="review-canvas-col-header">
                      <span className="accent-bar" style={{ background: c.accent }}></span>
                      <span className="review-canvas-col-name">{c.name.split("|")[0].trim()}</span>
                    </div>
                    <div className="review-canvas-col-stats">
                      {c.structure} · {c.channelType} · ${c.budget.toLocaleString()}/mo · {c.adGroups.length}AG · {c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0)}KW
                    </div>
                    {c.adGroups.map(ag => (
                      <div key={ag.id} className="review-canvas-ag">
                        <p className="review-canvas-ag-name">{ag.name}</p>
                        <p className="review-canvas-ag-meta">{ag.keywords.length} KW · {ag.landingPath || "no path"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="action-row">
            <p className="summary">
              {campaigns.length} CAMPAIGNS · {totalAG} AD GROUPS · {totalKW} KEYWORDS · ${(totalBudget/1000).toFixed(0)}K/MO
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              {archSubIdx > 0 ? (
                <button className="btn ghost" onClick={() => setArchSub(archSubStages[archSubIdx - 1])}>← {archSubMeta[archSubStages[archSubIdx - 1]].title}</button>
              ) : (
                <button className="btn ghost" onClick={() => setStage("brief")}>← Brief</button>
              )}
              {archSubIdx < archSubStages.length - 1 ? (
                <button className="btn primary" onClick={() => setArchSub(archSubStages[archSubIdx + 1])}>Next: {archSubMeta[archSubStages[archSubIdx + 1]].title} →</button>
              ) : (
                <button className="btn primary" onClick={() => alert("Generate stage — coming next")}>Generate copy →</button>
              )}
            </div>
          </div>
        </div>

        {/* GENERATE STUB */}
        <div className={`view ${stage === "generate" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 03 · Generate</p>
              <h1 className="stage-title">Workspace <em>coming next</em></h1>
              <p className="stage-sub">Per-ad-group RSA editor with live preview, full build view, AI regenerate, bulk actions.</p>
            </div>
          </div>
        </div>

        {/* CLIENT REVIEW STUB */}
        <div className={`view ${stage === "review" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 04 · Client review</p>
              <h1 className="stage-title">Interactive review <em>coming next</em></h1>
              <p className="stage-sub">White-label, magic-link review page. Real SERP previews, cycle combinations, approve/comment per variation.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-section"><span className="status-dot ok"></span><span>BRAIVE</span><strong>GJBON</strong>/<strong>Spring display 2026</strong></div>
        <div className="status-section"><span>STAGE</span><strong>{stage.toUpperCase()}{stage === "architect" ? ` · ${archSub.toUpperCase()}` : ""}</strong></div>
        <div className="status-section"><strong>{campaigns.length}</strong>CAM · <strong>{totalAG}</strong>AG · <strong>{totalKW}</strong>KW · <strong>${(totalBudget / 1000).toFixed(0)}K</strong>/MO</div>
        <div className="status-section spacer"></div>
        <div className="status-section">AI<strong style={{ color: "var(--ai)", marginLeft: 4 }}>READY</strong></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘K</span><span>palette</span></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘N</span><span>new</span></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘⏎</span><span>generate</span></div>
      </div>

      {paletteOpen && (
        <div className="palette-overlay open" onClick={e => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
          <div className="palette" onClick={e => e.stopPropagation()}>
            <div className="palette-input-row">
              <span className="palette-prompt">›</span>
              <input ref={paletteInputRef} className="palette-input" type="text" placeholder="Type a command, search, or ask AI..." />
              <span className="kbd">esc</span>
            </div>
            <p className="palette-section-label">AI · Type ? to ask</p>
            <div className="palette-row">
              <span className="palette-icon ai">b</span>
              <span className="palette-row-text"><span className="palette-row-title">Ask BRAIVE AI...</span><span className="palette-row-sub">analyze, suggest, generate</span></span>
              <span className="palette-row-shortcut">↵</span>
            </div>
            <p className="palette-section-label">Actions</p>
            <div className="palette-row" onClick={() => { addCampaign(); setPaletteOpen(false); }}>
              <span className="palette-icon cmd">+</span>
              <span className="palette-row-text"><span className="palette-row-title">New campaign</span></span>
              <span className="palette-row-shortcut">⌘N</span>
            </div>
            <div className="palette-row" onClick={() => { setStage("generate"); setPaletteOpen(false); }}>
              <span className="palette-icon cmd">⏎</span>
              <span className="palette-row-text"><span className="palette-row-title">Generate copy for all ad groups</span></span>
              <span className="palette-row-shortcut">⌘⏎</span>
            </div>
            <p className="palette-section-label">Jump to</p>
            <div className="palette-row" onClick={() => { setStage("architect"); setArchSub("campaigns"); setPaletteOpen(false); }}>
              <span className="palette-icon nav">▣</span>
              <span className="palette-row-text"><span className="palette-row-title">Architect / Campaigns</span></span>
              <span className="palette-row-shortcut">1</span>
            </div>
            <div className="palette-row" onClick={() => { setStage("architect"); setArchSub("keywords"); setPaletteOpen(false); }}>
              <span className="palette-icon nav">▣</span>
              <span className="palette-row-text"><span className="palette-row-title">Architect / Keywords</span></span>
              <span className="palette-row-shortcut">2</span>
            </div>
            <div className="palette-row" onClick={() => { setStage("architect"); setArchSub("targeting"); setPaletteOpen(false); }}>
              <span className="palette-icon nav">▣</span>
              <span className="palette-row-text"><span className="palette-row-title">Architect / Targeting</span></span>
              <span className="palette-row-shortcut">3</span>
            </div>
            <div className="palette-footer">
              <span className="palette-footer-item"><span className="kbd">↑↓</span> navigate</span>
              <span className="palette-footer-item"><span className="kbd">↵</span> select</span>
              <span className="palette-footer-item"><span className="kbd">esc</span> close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============= REUSABLE: Keyword input =============
function KeywordInput({ keywords, onAdd, onRemove, onCycle }: {
  keywords: Keyword[];
  onAdd: (text: string) => void;
  onRemove: (i: number) => void;
  onCycle: (i: number) => void;
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
          className="chip-input-text"
          value={text}
          onChange={e => setText(e.target.value)}
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
  chips: string[];
  onAdd: (text: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
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
        className="chip-input-text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(text);
            setText("");
          }
        }}
        placeholder={chips.length === 0 ? placeholder : "Add another..."}
      />
    </div>
  );
}
