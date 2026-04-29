"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, FileText, Clock, Check, MessageSquare, ExternalLink, Trash2, Eye, Sparkles } from "lucide-react";

type BuildRow = {
  id: string;
  brand_name: string | null;
  brand_url: string | null;
  status: "draft" | "in_review" | "approved" | "live" | "archived";
  created_at: string;
  updated_at: string;
  campaign_count: number;
  review_count: number;
  last_client_view: string | null;
  approval_count: number;
  note_count: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  live: "Live",
  archived: "Archived",
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function safeHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function BuildsDashboard() {
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "in_review" | "approved" | "live">("all");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/builds");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setBuilds(data.builds || []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function archiveBuild(id: string, brandName: string | null) {
    if (!confirm(`Archive "${brandName || 'this build'}"? You can recover from the archived view later.`)) return;
    try {
      const res = await fetch(`/api/builds/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err: any) {
      alert("Archive failed: " + (err?.message || String(err)));
    }
  }

  const filtered = filter === "all" ? builds : builds.filter((b) => b.status === filter);

  const counts = {
    all: builds.length,
    draft: builds.filter((b) => b.status === "draft").length,
    in_review: builds.filter((b) => b.status === "in_review").length,
    approved: builds.filter((b) => b.status === "approved").length,
    live: builds.filter((b) => b.status === "live").length,
  };

  return (
    <div className="dashboard">
      <header className="dashboard-h">
        <div className="dashboard-h-l">
          <img src="/architect-logo.jpg" alt="Architect" className="dashboard-logo" />
        </div>
        <div className="dashboard-h-actions">
          <button className="btn sm ghost" onClick={refresh} title="Refresh">
            <RefreshCw size={12} /> Refresh
          </button>
          <Link href="/" className="btn primary">
            <Plus size={13} /> New build
          </Link>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-intro">
          <h1>Builds</h1>
          <p>Every campaign architecture you've built. Click into one to keep working, or send for client review.</p>
        </div>

        <div className="dashboard-filters">
          {([
            { k: "all", label: "All" },
            { k: "draft", label: "Draft" },
            { k: "in_review", label: "In review" },
            { k: "approved", label: "Approved" },
            { k: "live", label: "Live" },
          ] as const).map((f) => (
            <button
              key={f.k}
              className={"dashboard-filter" + (filter === f.k ? " active" : "")}
              onClick={() => setFilter(f.k)}
            >
              {f.label}
              <span className="dashboard-filter-count">{counts[f.k as keyof typeof counts]}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="dashboard-error">
            <strong>Couldn't load builds.</strong>
            <p>{error}</p>
            <p className="dashboard-error-hint">If this is the first run, make sure the Supabase schema migration has been applied (see /supabase/schema.sql).</p>
          </div>
        )}

        {loading && !builds.length && (
          <div className="dashboard-empty">Loading builds...</div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="dashboard-empty">
            <strong>{filter === "all" ? "No builds yet" : `No ${STATUS_LABELS[filter].toLowerCase()} builds`}</strong>
            <p>{filter === "all" ? "Start your first campaign architecture - it'll save here automatically." : "Switch filters or start a new build."}</p>
            <Link href="/" className="btn primary">
              <Sparkles size={13} /> Start a build
            </Link>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="dashboard-list">
            {filtered.map((b) => (
              <div key={b.id} className="build-card">
                <div className="build-card-main">
                  <div className="build-card-h">
                    <Link href={`/?build=${b.id}`} className="build-card-name">
                      {b.brand_name || safeHost(b.brand_url) || "Untitled build"}
                    </Link>
                    <span className={`build-status status-${b.status}`}>{STATUS_LABELS[b.status]}</span>
                  </div>
                  <div className="build-card-url">
                    {b.brand_url ? (
                      <>
                        <ExternalLink size={10} />
                        {safeHost(b.brand_url)}
                      </>
                    ) : (
                      <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>no URL yet</span>
                    )}
                  </div>
                  <div className="build-card-stats">
                    <span><FileText size={11} /> {b.campaign_count} campaign{b.campaign_count === 1 ? "" : "s"}</span>
                    <span><Clock size={11} /> Updated {formatRelativeTime(b.updated_at)}</span>
                    {b.review_count > 0 && (
                      <>
                        <span><Eye size={11} /> {b.review_count} review link{b.review_count === 1 ? "" : "s"}</span>
                        {b.last_client_view && (
                          <span><Clock size={11} /> Last viewed {formatRelativeTime(b.last_client_view)}</span>
                        )}
                      </>
                    )}
                    {b.approval_count > 0 && (
                      <span className="build-stat-positive"><Check size={11} /> {b.approval_count} approved</span>
                    )}
                    {b.note_count > 0 && (
                      <span className="build-stat-warn"><MessageSquare size={11} /> {b.note_count} note{b.note_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </div>
                <div className="build-card-actions">
                  <Link href={`/?build=${b.id}`} className="btn sm">Open</Link>
                  <button className="btn sm ghost" onClick={() => archiveBuild(b.id, b.brand_name)} title="Archive">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
