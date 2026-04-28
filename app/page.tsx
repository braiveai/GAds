"use client";

import { useState, useEffect, useRef } from "react";

// ============= TYPES =============
type MatchType = "phrase" | "exact" | "broad";
type Structure = "MKAG" | "SKAG" | "STAG" | "Hagakure" | "Custom";
type Stage = "brief" | "architect" | "generate" | "review";

interface Keyword { text: string; match: MatchType; }
interface AdGroup { id: string; name: string; aiNote: string | null; keywords: Keyword[]; }
interface Campaign {
  id: string; name: string; structure: Structure; type: string;
  accent: string; budget: number; location: string; bidStrategy: string;
  aiNote: string | null; adGroups: AdGroup[];
}

// ============= INITIAL DATA =============
const initialCampaigns: Campaign[] = [
  {
    id: "cm_generic", name: "Brisbane North x Generic | SD",
    structure: "MKAG", type: "PMax", accent: "#4A8C5C",
    budget: 4000, location: "Brisbane North", bidStrategy: "Max conversions",
    aiNote: "Strong intent · highest forecasted volume",
    adGroups: [{
      id: "ag_g_general", name: "Generic | MKAG", aiNote: null,
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
    structure: "MKAG", type: "Search", accent: "#5C6FFF",
    budget: 2000, location: "Brisbane N + 25km", bidStrategy: "Max clicks",
    aiNote: null,
    adGroups: [
      {
        id: "ag_d_display", name: "Display Homes | MKAG", aiNote: null,
        keywords: [
          { text: "display homes brisbane north", match: "phrase" },
          { text: "display home open today", match: "phrase" },
          { text: "visit display home brisbane", match: "phrase" },
        ],
      },
      {
        id: "ag_d_open", name: "Open House | MKAG",
        aiNote: "consolidate? overlaps with Display Homes",
        keywords: [
          { text: "open house this weekend brisbane", match: "phrase" },
          { text: "home builders open day", match: "broad" },
        ],
      },
    ],
  },
  {
    id: "cm_kdr", name: "Brisbane North x KDR | SD",
    structure: "STAG", type: "Search", accent: "#FF6B3D",
    budget: 2000, location: "Brisbane North", bidStrategy: "Target CPA $80",
    aiNote: "underbudgeted · ~120 searches/mo",
    adGroups: [
      {
        id: "ag_k_kdr", name: "Knockdown Rebuild | STAG", aiNote: null,
        keywords: [
          { text: "knockdown rebuild brisbane", match: "phrase" },
          { text: "knock down rebuild cost", match: "phrase" },
          { text: "demolish and rebuild brisbane", match: "phrase" },
          { text: "knockdown rebuild near me", match: "exact" },
        ],
      },
      {
        id: "ag_k_demo", name: "Demolition + Rebuild | STAG", aiNote: null,
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

// ============= MAIN COMPONENT =============
export default function Page() {
  const [stage, setStage] = useState<Stage>("architect");
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [leanValue, setLeanValue] = useState(35);
  const [channels, setChannels] = useState({ search: false, pmax: true, demand: false });
  const paletteInputRef = useRef<HTMLInputElement>(null);

  // Cmd+K to open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setOpenPicker(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (paletteOpen) setTimeout(() => paletteInputRef.current?.focus(), 50);
  }, [paletteOpen]);

  // Click outside to close picker
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".struct-picker")) setOpenPicker(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ============= MUTATIONS =============
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
            aiNote: null,
            keywords: [kw],
          }))
        );
      }
      return { ...c, structure: s, adGroups };
    });
    setOpenPicker(null);
  };

  const cycleMatch = (cid: string, aid: string, kwIdx: number) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : {
        ...ag,
        keywords: ag.keywords.map((kw, i) => i !== kwIdx ? kw : {
          ...kw,
          match: matchTypeOrder[(matchTypeOrder.indexOf(kw.match) + 1) % 3]
        })
      })
    }));
  };

  const removeKw = (cid: string, aid: string, kwIdx: number) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : {
        ...ag,
        keywords: ag.keywords.filter((_, i) => i !== kwIdx)
      })
    }));
  };

  const addKw = (cid: string, aid: string) => {
    const text = prompt("Add keyword:");
    if (!text) return;
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id !== aid ? ag : {
        ...ag,
        keywords: [...ag.keywords, { text: text.trim(), match: "phrase" as MatchType }]
      })
    }));
  };

  const addAdGroup = (cid: string) => {
    updateCampaign(cid, c => ({
      ...c,
      adGroups: [...c.adGroups, {
        id: `ag_new_${Math.random().toString(36).slice(2, 8)}`,
        name: `New ad group | ${c.structure}`,
        aiNote: null,
        keywords: [],
      }]
    }));
  };

  const addCampaign = () => {
    setCampaigns(prev => [...prev, {
      id: `cm_new_${Math.random().toString(36).slice(2, 8)}`,
      name: "New campaign | SD",
      structure: "MKAG", type: "Search", accent: "#7A7A85",
      budget: 1000, location: "All locations", bidStrategy: "Max clicks",
      aiNote: null, adGroups: [],
    }]);
  };

  const updateCampaignName = (cid: string, name: string) =>
    updateCampaign(cid, c => ({ ...c, name }));

  const updateAdGroupName = (cid: string, aid: string, name: string) =>
    updateCampaign(cid, c => ({
      ...c,
      adGroups: c.adGroups.map(ag => ag.id === aid ? { ...ag, name } : ag)
    }));

  // ============= COMPUTED =============
  const totalAdGroups = campaigns.reduce((s, c) => s + c.adGroups.length, 0);
  const totalKeywords = campaigns.reduce((s, c) => s + c.adGroups.reduce((s2, ag) => s2 + ag.keywords.length, 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);

  const stages: Stage[] = ["brief", "architect", "generate", "review"];
  const stageIdx = stages.indexOf(stage);

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"></div>
          <div className="brand-text">
            <span className="brand-name">BRAIVE</span>
            <span className="brand-product">Ads</span>
          </div>
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
            <div>
              <p className="user-name">Matt Travers</p>
              <p className="user-org">BRAIVE</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
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

        {/* BRIEF */}
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

        {/* ARCHITECT */}
        <div className={`view ${stage === "architect" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 02 · Account architecture</p>
              <h1 className="stage-title">Build your <em>account structure</em></h1>
              <p className="stage-sub">{campaigns.length} campaigns proposed from the brief. Edit anything. Switch structure types per campaign. AI suggestions appear inline as you work.</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn">Import keywords</button>
              <button className="btn">Export plan</button>
            </div>
          </div>

          <div className="arch-toolbar">
            <div className="view-toggle">
              <button className="active">▣ Canvas</button>
              <button>≡ Table</button>
              <button>⌘ Tree</button>
            </div>
            <div className="arch-toolbar-divider"></div>
            <div className={`struct-picker ${openPicker === "default" ? "open" : ""}`}>
              <button className="struct-picker-btn" onClick={e => { e.stopPropagation(); setOpenPicker(openPicker === "default" ? null : "default"); }}>
                <span className="lbl">DEFAULT</span> MKAG <span className="chev">▾</span>
              </button>
              {openPicker === "default" && (
                <div className="struct-picker-menu">
                  {(Object.keys(structDescs) as Structure[]).map(s => (
                    <div key={s} className={`struct-option ${s === "MKAG" ? "active" : ""}`}>
                      <p className="struct-option-name">{s}{s === "MKAG" && <span className="badge">SUNNY DEFAULT</span>}</p>
                      <p className="struct-option-desc">{structDescs[s]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="arch-toolbar-divider"></div>
            <span className="arch-stat">
              <strong>{campaigns.length}</strong> campaigns · <strong>{totalAdGroups}</strong> ad groups · <strong>{totalKeywords}</strong> keywords · <strong>${totalBudget.toLocaleString()}</strong>/mo
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn sm">Audience &amp; targeting</button>
              <button className="btn sm">Negatives <span className="kbd" style={{ marginLeft: 4 }}>12</span></button>
            </div>
          </div>

          <div className="arch-canvas">
            {campaigns.map(c => {
              const totalKw = c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0);
              const pickerKey = `c_${c.id}`;
              return (
                <div key={c.id} className="campaign-col">
                  <div className="campaign-col-header">
                    <div className="campaign-col-h-row1">
                      <span className="campaign-col-handle">⋮⋮</span>
                      <input className="campaign-name-input" value={c.name} onChange={e => updateCampaignName(c.id, e.target.value)} />
                    </div>
                    <div className="campaign-col-h-row2">
                      <span className="accent-bar" style={{ background: c.accent }}></span>
                      <div className={`struct-picker ${openPicker === pickerKey ? "open" : ""}`} onClick={e => e.stopPropagation()}>
                        <button className="struct-picker-btn" onClick={e => { e.stopPropagation(); setOpenPicker(openPicker === pickerKey ? null : pickerKey); }}>
                          {c.structure} <span className="chev">▾</span>
                        </button>
                        {openPicker === pickerKey && (
                          <div className="struct-picker-menu">
                            {(Object.keys(structDescs) as Structure[]).map(s => (
                              <div key={s} className={`struct-option ${c.structure === s ? "active" : ""}`} onClick={() => setStructure(c.id, s)}>
                                <p className="struct-option-name">{s}{s === "MKAG" && <span className="badge">DEFAULT</span>}</p>
                                <p className="struct-option-desc">{structDescs[s]}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="kw-match phrase" style={{ cursor: "default" }}>{c.type.toUpperCase()}</span>
                      {c.aiNote && <span className="ai-inline" style={{ marginTop: 0, paddingLeft: 12, fontSize: 9.5 }}>{c.aiNote}</span>}
                    </div>
                  </div>

                  <div className="campaign-col-stats">
                    <span className="campaign-col-stat">$<strong>{c.budget.toLocaleString()}</strong>/mo</span>
                    <span className="campaign-col-stat"><strong>{c.adGroups.length}</strong>AG</span>
                    <span className="campaign-col-stat"><strong>{totalKw}</strong>KW</span>
                    <span className="campaign-col-stat" style={{ marginLeft: "auto" }}>{c.location}</span>
                  </div>

                  <div className="campaign-col-body">
                    {c.adGroups.map(ag => (
                      <div key={ag.id} className="adgroup-card">
                        <div className="adgroup-h">
                          <span className="adgroup-handle">⋮⋮</span>
                          <input className="adgroup-name" value={ag.name} onChange={e => updateAdGroupName(c.id, ag.id, e.target.value)} />
                        </div>
                        <div className="adgroup-meta">
                          <span>{ag.keywords.length} KEYWORD{ag.keywords.length !== 1 ? "S" : ""}</span>
                          {ag.aiNote && <span className="ai-note">↳ {ag.aiNote}</span>}
                        </div>
                        <div className="kw-list">
                          {ag.keywords.map((kw, i) => (
                            <span key={i} className="kw-chip">
                              <span className={`kw-match ${kw.match}`} onClick={() => cycleMatch(c.id, ag.id, i)}>{matchLabels[kw.match]}</span>
                              <span className="kw-text">{kw.text}</span>
                              <span className="kw-x" onClick={() => removeKw(c.id, ag.id, i)}>×</span>
                            </span>
                          ))}
                          <button className="kw-add" onClick={() => addKw(c.id, ag.id)}>+ KW</button>
                        </div>
                      </div>
                    ))}
                    <button className="add-adgroup-btn" onClick={() => addAdGroup(c.id)}>+ ad group</button>
                  </div>
                </div>
              );
            })}
            <div className="add-campaign-col" onClick={addCampaign}>+ Campaign</div>
          </div>

          <div className="action-row">
            <p className="summary">{campaigns.length} CAMPAIGNS · {totalAdGroups} AD GROUPS · {totalKeywords} KEYWORDS · READY TO GENERATE</p>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn ghost" onClick={() => setStage("brief")}>← Brief</button>
              <button className="btn primary" onClick={() => alert("Generate stage — coming next")}>Generate copy →</button>
            </div>
          </div>
        </div>

        {/* GENERATE STUB */}
        <div className={`view ${stage === "generate" ? "active" : ""}`}>
          <div className="stage-header">
            <div>
              <p className="stage-eyebrow">Stage 03 · Generate</p>
              <h1 className="stage-title">Workspace <em>coming next</em></h1>
              <p className="stage-sub">Per-ad-group RSA editor with live preview, full build view, AI regenerate, bulk actions. Pass 2 of v8.</p>
            </div>
          </div>
        </div>

        {/* REVIEW STUB */}
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

      {/* STATUS BAR */}
      <div className="status-bar">
        <div className="status-section"><span className="status-dot ok"></span><span>BRAIVE</span><strong>GJBON</strong>/<strong>Spring display 2026</strong></div>
        <div className="status-section"><span>STAGE</span><strong>{stage.toUpperCase()}</strong></div>
        <div className="status-section"><strong>{campaigns.length}</strong>CAM · <strong>{totalAdGroups}</strong>AG · <strong>{totalKeywords}</strong>KW · <strong>${(totalBudget / 1000).toFixed(0)}K</strong>/MO</div>
        <div className="status-section spacer"></div>
        <div className="status-section">AI<strong style={{ color: "var(--ai)", marginLeft: 4 }}>READY</strong></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘K</span><span>palette</span></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘N</span><span>new</span></div>
        <div className="status-section status-shortcut"><span className="kbd">⌘⏎</span><span>generate</span></div>
      </div>

      {/* COMMAND PALETTE */}
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
            <div className="palette-row active" onClick={() => { addCampaign(); setPaletteOpen(false); }}>
              <span className="palette-icon cmd">+</span>
              <span className="palette-row-text"><span className="palette-row-title">New campaign</span></span>
              <span className="palette-row-shortcut">⌘N</span>
            </div>
            <div className="palette-row">
              <span className="palette-icon cmd">↻</span>
              <span className="palette-row-text"><span className="palette-row-title">Switch all to SKAG</span></span>
              <span className="palette-row-shortcut">⌘S</span>
            </div>
            <div className="palette-row" onClick={() => { setStage("generate"); setPaletteOpen(false); }}>
              <span className="palette-icon cmd">⏎</span>
              <span className="palette-row-text"><span className="palette-row-title">Generate copy for all ad groups</span></span>
              <span className="palette-row-shortcut">⌘⏎</span>
            </div>
            <p className="palette-section-label">Navigate</p>
            <div className="palette-row">
              <span className="palette-icon nav">▣</span>
              <span className="palette-row-text"><span className="palette-row-title">Brands</span><span className="palette-row-sub">8 active</span></span>
              <span className="palette-row-shortcut">⌘2</span>
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
