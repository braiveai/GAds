"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Layers, Clock, Check, MessageSquare, ExternalLink, Trash2, Eye, Sparkles, ArrowRight, Hash, Send, Search, X } from "lucide-react";

type BuildRow = {
  id: string;
  brand_name: string | null;
  brand_url: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  campaign_count: number | null;
  ad_group_count: number | null;
  keyword_count: number | null;
  ad_groups_with_copy: number | null;
  daily_budget: number | null;
  review_count: number | null;
  last_client_view: string | null;
  approval_count: number | null;
  note_count: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
};

const DAYS_PER_MONTH = 30.4;

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

function fmtMoney(n: number): string {
  return `$${(Number(n) || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
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
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");

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
    const build = builds.find((b) => b.id === id);
    const isArchived = build?.status === "archived";
    const verb = isArchived ? "Restore" : "Archive";
    const action = isArchived ? "restore" : "archive";
    if (!confirm(`${verb} "${brandName || 'this build'}"?`)) return;
    try {
      if (isArchived) {
        // Restore via POST update
        const res = await fetch(`/api/builds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: "active" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        // Archive via DELETE
        const res = await fetch(`/api/builds/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: any) {
      alert(`${verb} failed: ` + (err?.message || String(err)));
    }
  }

  // Filter: status + search query (matches brand_name and brand_url)
  const q = searchQuery.trim().toLowerCase();
  const filtered = builds.filter((b) => {
    // We want active to be everything-not-archived; archived is its own bucket
    const isArchived = b.status === "archived";
    if (filter === "active" && isArchived) return false;
    if (filter === "archived" && !isArchived) return false;
    if (q) {
      const haystack = `${b.brand_name || ""} ${b.brand_url || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    active: builds.filter((b) => b.status !== "archived").length,
    archived: builds.filter((b) => b.status === "archived").length,
  };

  return (
    <div className="dashboard">
      <header className="dashboard-h">
        <div className="dashboard-h-l">
          <img src="/architect-logo.png" alt="Architect" className="dashboard-logo" />
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
          <p>Every campaign architecture you've built. Click into one to keep working.</p>
        </div>

        <div className="dashboard-controls">
          <div className="dashboard-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Search by brand or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dashboard-search-input"
            />
            {searchQuery && (
              <button
                className="dashboard-search-clear"
                onClick={() => setSearchQuery("")}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="dashboard-filters">
            {([
              { k: "active", label: "Active" },
              { k: "archived", label: "Archived" },
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
            <strong>
              {q
                ? `No builds match "${searchQuery}"`
                : filter === "archived"
                ? "Nothing archived"
                : "No builds yet"}
            </strong>
            <p>
              {q
                ? "Try a different search or clear it."
                : filter === "archived"
                ? "Builds you archive will appear here. You can restore them later."
                : "Start your first campaign architecture - it'll save here automatically."}
            </p>
            {q ? (
              <button className="btn primary" onClick={() => setSearchQuery("")}>
                <X size={13} /> Clear search
              </button>
            ) : filter === "active" ? (
              <Link href="/" className="btn primary">
                <Sparkles size={13} /> Start a build
              </Link>
            ) : null}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="dashboard-list">
            {filtered.map((b) => {
              // Defensive coercion - schema migration may not have applied yet, so any of these can be null/undefined
              const campaignCount = Number(b.campaign_count) || 0;
              const adGroupCount = Number(b.ad_group_count) || 0;
              const keywordCount = Number(b.keyword_count) || 0;
              const adGroupsWithCopy = Number(b.ad_groups_with_copy) || 0;
              const dailyBudget = Number(b.daily_budget) || 0;
              const reviewCount = Number(b.review_count) || 0;

              const monthlyBudget = dailyBudget * DAYS_PER_MONTH;
              const copyProgress = adGroupCount > 0 ? (adGroupsWithCopy / adGroupCount) * 100 : 0;
              const isArchived = b.status === "archived";

              return (
                <Link key={b.id} href={`/?build=${b.id}`} className="build-card-v2">
                  <div className="build-card-v2-h">
                    <div className="build-card-v2-title">
                      <span className="build-card-v2-name">{b.brand_name || safeHost(b.brand_url) || "Untitled build"}</span>
                    </div>
                    <div className="build-card-v2-meta">
                      {b.brand_url && (
                        <span className="build-card-v2-url">
                          <ExternalLink size={10} /> {safeHost(b.brand_url)}
                        </span>
                      )}
                      <span className="build-card-v2-time">
                        <Clock size={10} /> Updated {formatRelativeTime(b.updated_at)}
                      </span>
                    </div>
                  </div>

                  <div className="build-card-v2-stats">
                    <div className="bc-stat">
                      <span className="bc-stat-value">{campaignCount}</span>
                      <span className="bc-stat-label">Campaigns</span>
                    </div>
                    <div className="bc-stat">
                      <span className="bc-stat-value">{adGroupCount}</span>
                      <span className="bc-stat-label">Ad groups</span>
                    </div>
                    <div className="bc-stat">
                      <span className="bc-stat-value">{keywordCount.toLocaleString()}</span>
                      <span className="bc-stat-label">Keywords</span>
                    </div>
                    <div className="bc-stat">
                      <span className="bc-stat-value bc-stat-accent">{fmtMoney(monthlyBudget)}</span>
                      <span className="bc-stat-label">Monthly</span>
                    </div>
                  </div>

                  {/* Copy generation progress (always shown if any ad groups exist) */}
                  {adGroupCount > 0 && (
                    <div className="bc-progress">
                      <div className="bc-progress-h">
                        <span className="bc-progress-label">
                          <Sparkles size={10} /> Copy
                        </span>
                        <span className="bc-progress-meta">
                          <strong>{adGroupsWithCopy}</strong> / {adGroupCount} ad groups
                          {adGroupsWithCopy === adGroupCount && adGroupCount > 0 && <span className="bc-progress-badge">complete</span>}
                        </span>
                      </div>
                      <div className="bc-progress-bar">
                        <div className="bc-progress-fill bc-progress-copy" style={{ width: `${copyProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="build-card-v2-foot">
                    <div className="bc-foot-l">
                      {reviewCount > 0 ? (
                        <span className="bc-foot-meta">
                          <Eye size={10} /> {reviewCount} preview link{reviewCount === 1 ? "" : "s"}
                          {b.last_client_view && <> · last viewed {formatRelativeTime(b.last_client_view)}</>}
                        </span>
                      ) : (
                        <span className="bc-foot-meta">
                          <Send size={10} /> No preview link yet
                        </span>
                      )}
                    </div>
                    <div className="bc-foot-r">
                      <button
                        className="bc-archive-btn"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveBuild(b.id, b.brand_name); }}
                        title={isArchived ? "Restore" : "Archive"}
                      >
                        <Trash2 size={11} />
                      </button>
                      <span className="bc-open">Open <ArrowRight size={11} /></span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
