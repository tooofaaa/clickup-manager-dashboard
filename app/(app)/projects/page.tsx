"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Loader2, LayoutGrid, CheckSquare, AlertTriangle, Users } from "lucide-react";
import { apiGet } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceHealth {
  spaceId: string;
  spaceName: string;
  color: string;
  total: number;
  closed: number;
  overdue: number;
  pct: number;
}

interface TeamEvalInsights {
  totalTasks: number;
  overdueTotal: number;
  membersWithTasks: number;
  tasksBySpace: SpaceHealth[];
}

interface TeamEvalResponse {
  insights: TeamEvalInsights;
  period: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progressColor(pct: number): string {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function progressTrack(pct: number): string {
  if (pct >= 70) return "bg-green-100 dark:bg-green-950";
  if (pct >= 40) return "bg-amber-100 dark:bg-amber-950";
  return "bg-red-100 dark:bg-red-950";
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Space Card
// ---------------------------------------------------------------------------

function SpaceCard({ space }: { space: SpaceHealth }) {
  const router = useRouter();
  const open = space.total - space.closed;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm transition-shadow hover:shadow-md">
      {/* Color header strip */}
      <div className="h-2 w-full" style={{ backgroundColor: space.color }} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Space name */}
        <h3 className="truncate text-sm font-semibold text-cu-text">{space.spaceName}</h3>

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-cu-text-tertiary">
            <span>Progress</span>
            <span className="font-medium text-cu-text">{space.pct}%</span>
          </div>
          <div className={`h-2 w-full overflow-hidden rounded-full ${progressTrack(space.pct)}`}>
            <div
              className={`h-full rounded-full transition-all ${progressColor(space.pct)}`}
              style={{ width: `${space.pct}%` }}
            />
          </div>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-4 gap-1">
          <StatChip label="Total" value={space.total} />
          <StatChip label="Closed" value={space.closed} color="text-green-600 dark:text-green-400" />
          <StatChip label="Overdue" value={space.overdue} color={space.overdue > 0 ? "text-red-600 dark:text-red-400" : undefined} />
          <StatChip label="Open" value={open} />
        </div>

        {/* View Details */}
        <button
          onClick={() => router.push(`/space/${space.spaceId}`)}
          className="mt-auto w-full rounded-lg border border-cu-border bg-cu-sidebar px-3 py-1.5 text-xs font-medium text-cu-text-secondary transition-colors hover:border-cu-purple hover:bg-cu-purple/10 hover:text-cu-purple"
        >
          View Details →
        </button>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-cu-hover px-1 py-1.5">
      <span className={`text-sm font-semibold ${color ?? "text-cu-text"}`}>{value}</span>
      <span className="text-[10px] text-cu-text-tertiary">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-cu-text">{value}</div>
        <div className="text-xs text-cu-text-tertiary">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const {
    data,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useQuery<TeamEvalResponse>({
    queryKey: ["projects-overview"],
    queryFn: () => apiGet("/api/clickup/team-eval"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = Math.round((now - dataUpdatedAt) / 1000);
  const timeLabel = dataUpdatedAt > 0
    ? (secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.round(secondsAgo / 60)}m ago`)
    : "Loading...";

  const insights = data?.insights;
  const spaces = insights?.tasksBySpace ?? [];
  const totalSpaces = spaces.length;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-cu-bg px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cu-text">Projects</h1>
          <p className="mt-0.5 text-sm text-cu-text-secondary">All Spaces</p>
          <p className="mt-0.5 text-xs text-cu-text-tertiary">
            Last updated: {timeLabel}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <span className="text-[10px]">●</span>
            Live · auto-syncs every 60s
          </span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border bg-cu-panel px-3 py-1.5 text-sm font-medium text-cu-text-secondary shadow-sm transition-colors hover:border-cu-purple hover:text-cu-purple disabled:opacity-60"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isFetching ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<LayoutGrid className="h-5 w-5 text-cu-purple" />}
          label="Total Spaces"
          value={isFetching && !data ? "—" : totalSpaces}
          color="bg-cu-purple/10"
        />
        <KpiCard
          icon={<CheckSquare className="h-5 w-5 text-blue-500" />}
          label="Total Tasks"
          value={isFetching && !data ? "—" : (insights?.totalTasks ?? 0)}
          color="bg-blue-500/10"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          label="Overdue Tasks"
          value={isFetching && !data ? "—" : (insights?.overdueTotal ?? 0)}
          color="bg-red-500/10"
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-green-500" />}
          label="Active Members"
          value={isFetching && !data ? "—" : (insights?.membersWithTasks ?? 0)}
          color="bg-green-500/10"
        />
      </div>

      {/* Space cards grid */}
      {isFetching && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cu-purple" />
        </div>
      ) : spaces.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-cu-text-tertiary">
          No spaces found. Make sure CLICKUP_TEAM_ID is configured.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {spaces.map((space) => (
            <SpaceCard key={space.spaceId} space={space} />
          ))}
        </div>
      )}
    </div>
  );
}
