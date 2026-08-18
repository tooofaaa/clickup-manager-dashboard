"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Loader2,
  LayoutGrid,
  SquareCheckBig,
  AlertTriangle,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
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

interface MemberInfo {
  id: string;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
  initials: string;
}

interface MemberResult {
  member: MemberInfo;
  taskCount: number;
  metrics: {
    score: number | null;
    completionRate: number;
    overdueRate: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    hoursLogged: number;
  };
}

interface TeamEvalInsights {
  totalTasks: number;
  overdueTotal: number;
  membersWithTasks: number;
  membersWithoutTasks: number;
  completedInPeriod: number;
  createdInPeriod: number;
  tasksBySpace: SpaceHealth[];
  hasPeriodData: boolean;
  totalTasksAllTime: number;
}

interface TeamEvalResponse {
  members: MemberResult[];
  insights: TeamEvalInsights;
  period: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type PeriodPreset = "this-month" | "last-month" | "this-quarter" | "custom";

function getPresetRange(
  preset: PeriodPreset,
  customStart: string,
  customEnd: string
): { start: number; end: number } {
  const now = new Date();
  const today = Date.now();

  if (preset === "this-month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      end: today,
    };
  }
  if (preset === "last-month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
    };
  }
  if (preset === "this-quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      start: new Date(now.getFullYear(), q * 3, 1).getTime(),
      end: today,
    };
  }
  // custom
  return {
    start: customStart
      ? new Date(customStart).getTime()
      : new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: customEnd ? new Date(customEnd + "T23:59:59").getTime() : today,
  };
}

function formatPeriodLabel(start: number, end: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function progressColor(pct: number) {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function progressTrack(pct: number) {
  if (pct >= 70) return "bg-green-100 dark:bg-green-950";
  if (pct >= 40) return "bg-amber-100 dark:bg-amber-950";
  return "bg-red-100 dark:bg-red-950";
}

function progressTextColor(pct: number) {
  if (pct >= 70) return "text-green-600 dark:text-green-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreStyle(score: number) {
  if (score >= 70)
    return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400";
  if (score >= 40)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Member Avatar
// ---------------------------------------------------------------------------

function MemberAvatar({
  member,
  size = "sm",
}: {
  member: MemberInfo;
  size?: "sm" | "md";
}) {
  const cls =
    size === "sm"
      ? "h-7 w-7 text-[10px]"
      : "h-9 w-9 text-xs";

  if (member.profilePicture) {
    return (
      <img
        src={member.profilePicture}
        alt={member.username ?? member.email}
        title={member.username ?? member.email}
        className={`${cls} rounded-full object-cover ring-2 ring-cu-bg`}
      />
    );
  }

  const label =
    member.initials ||
    (member.username ?? member.email).slice(0, 2).toUpperCase();

  return (
    <div
      title={member.username ?? member.email}
      className={`${cls} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-cu-bg`}
      style={{ backgroundColor: member.color ?? "#7b68ee" }}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatChip
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  color,
  alert,
}: {
  label: string;
  value: number;
  color?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-lg px-1 py-2 ${
        alert ? "bg-red-50 dark:bg-red-950/30" : "bg-cu-hover"
      }`}
    >
      <span className={`text-sm font-bold ${color ?? "text-cu-text"}`}>
        {value}
      </span>
      <span className="text-[10px] text-cu-text-tertiary">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Card
// ---------------------------------------------------------------------------

function SpaceCard({ space }: { space: SpaceHealth }) {
  const router = useRouter();
  const isEmpty = space.total === 0;

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm transition-all hover:scale-[1.02] hover:shadow-md${isEmpty ? " opacity-60" : ""}`}
    >
      {/* Colored header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: space.color + "22" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: space.color }}
          />
          <h3 className="truncate text-sm font-semibold text-cu-text">
            {space.spaceName}
          </h3>
        </div>
        <button
          onClick={() => router.push(`/space/${space.spaceId}`)}
          aria-label="Open space"
          className="shrink-0 rounded p-1 text-cu-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-cu-purple"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {isEmpty ? (
          <p className="py-4 text-center text-xs text-cu-text-tertiary">
            No tasks yet
          </p>
        ) : (
          <>
            {/* Progress */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-cu-text-tertiary">Progress</span>
                <span
                  className={`font-semibold ${progressTextColor(space.pct)}`}
                >
                  {space.pct}%
                </span>
              </div>
              <div
                className={`h-1.5 w-full overflow-hidden rounded-full ${progressTrack(space.pct)}`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressColor(space.pct)}`}
                  style={{ width: `${space.pct}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-1.5">
              <StatChip label="Total" value={space.total} />
              <StatChip
                label="Done"
                value={space.closed}
                color="text-green-600 dark:text-green-400"
              />
              <StatChip
                label="Overdue"
                value={space.overdue}
                color={
                  space.overdue > 0
                    ? "text-red-600 dark:text-red-400"
                    : undefined
                }
                alert={space.overdue > 0}
              />
            </div>

            <p className="text-[10px] text-cu-text-tertiary">
              View details for team breakdown
            </p>
          </>
        )}

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

// ---------------------------------------------------------------------------
// Space Card Skeleton
// ---------------------------------------------------------------------------

function SpaceCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm">
      <div className="h-[46px] animate-pulse bg-cu-hover" />
      <div className="flex flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-3 w-1/3 animate-pulse rounded bg-cu-hover" />
            <div className="h-3 w-8 animate-pulse rounded bg-cu-hover" />
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-cu-hover" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-cu-hover" />
          ))}
        </div>
        <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-cu-hover" />
        <div className="mt-auto h-7 animate-pulse rounded-lg bg-cu-hover" />
      </div>
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
  sub,
  color,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-cu-panel p-4 shadow-sm ${
        alert ? "border-red-300 dark:border-red-800" : "border-cu-border"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div
          className={`text-xl font-bold ${
            alert ? "text-red-600 dark:text-red-400" : "text-cu-text"
          }`}
        >
          {value}
        </div>
        <div className="text-xs text-cu-text-tertiary">{label}</div>
        {sub && (
          <div className="mt-0.5 text-[10px] text-cu-text-tertiary">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortKey = "tasks" | "overdue" | "progress" | "az";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "tasks", label: "By Tasks" },
  { key: "overdue", label: "By Overdue" },
  { key: "progress", label: "By Progress" },
  { key: "az", label: "A–Z" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tasks");
  const [teamExpanded, setTeamExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());

  const period = getPresetRange(preset, customStart, customEnd);

  const { data, isFetching, dataUpdatedAt, refetch } =
    useQuery<TeamEvalResponse>({
      queryKey: ["projects-overview", period.start, period.end],
      queryFn: () =>
        apiGet<TeamEvalResponse>(
          `/api/clickup/team-eval?start=${period.start}&end=${period.end}`
        ),
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const secondsAgo = Math.round((now - dataUpdatedAt) / 1000);
  const timeLabel =
    dataUpdatedAt > 0
      ? secondsAgo < 60
        ? `${secondsAgo}s ago`
        : `${Math.round(secondsAgo / 60)}m ago`
      : "Loading...";

  const insights = data?.insights;
  const members = data?.members ?? [];
  const spaces = insights?.tasksBySpace ?? [];

  const sortedSpaces = useMemo(() => {
    const arr = [...spaces];
    if (sortKey === "tasks") return arr.sort((a, b) => b.total - a.total);
    if (sortKey === "overdue") return arr.sort((a, b) => b.overdue - a.overdue);
    if (sortKey === "progress") return arr.sort((a, b) => b.pct - a.pct);
    return arr.sort((a, b) => a.spaceName.localeCompare(b.spaceName));
  }, [spaces, sortKey]);

  const isInitialLoad = isFetching && !data;
  const apiPeriod = data?.period ?? period;
  const periodLabel = formatPeriodLabel(apiPeriod.start, apiPeriod.end);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-cu-bg">
      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-cu-border bg-cu-bg/95 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-cu-text">Projects</h1>
            <p className="text-xs text-cu-text-tertiary">
              Your workspace at a glance
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-green-600 dark:text-green-400 sm:flex">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Live · auto-syncs every 60s
            </span>
            <span className="hidden text-xs text-cu-text-tertiary sm:block">
              Last updated: {timeLabel}
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
      </div>

      <div className="space-y-6 px-6 py-6">
        {/* ── Period selector ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 rounded-xl border border-cu-border bg-cu-panel p-1">
            <Calendar className="ml-2 h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
            {(
              [
                { id: "this-month", label: "This Month" },
                { id: "last-month", label: "Last Month" },
                { id: "this-quarter", label: "This Quarter" },
                { id: "custom", label: "Custom" },
              ] as { id: PeriodPreset; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPreset(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === id
                    ? "bg-cu-purple text-white shadow-sm"
                    : "text-cu-text-secondary hover:bg-cu-hover hover:text-cu-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-cu-text-tertiary">Period:</span>
            <span className="text-xs font-medium text-cu-text">
              {periodLabel}
            </span>
            {data && !insights?.hasPeriodData && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                no tasks match
              </span>
            )}
          </div>
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-cu-text-tertiary">From</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-cu-border bg-cu-panel px-3 py-1.5 text-xs text-cu-text focus:border-cu-purple focus:outline-none"
            />
            <span className="text-xs text-cu-text-tertiary">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-cu-border bg-cu-panel px-3 py-1.5 text-xs text-cu-text focus:border-cu-purple focus:outline-none"
            />
          </div>
        )}

        {/* ── KPI summary bar ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={<LayoutGrid className="h-5 w-5 text-cu-purple" />}
            label="Total Spaces"
            value={isInitialLoad ? "—" : spaces.length}
            color="bg-cu-purple/10"
          />
          <KpiCard
            icon={<SquareCheckBig className="h-5 w-5 text-blue-500" />}
            label="Total Tasks"
            value={isInitialLoad ? "—" : (insights?.totalTasks ?? 0)}
            sub={
              insights?.completedInPeriod != null
                ? `${insights.completedInPeriod} completed`
                : undefined
            }
            color="bg-blue-500/10"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            label="Overdue"
            value={isInitialLoad ? "—" : (insights?.overdueTotal ?? 0)}
            color="bg-red-500/10"
            alert={(insights?.overdueTotal ?? 0) > 0}
          />
          <KpiCard
            icon={<Users className="h-5 w-5 text-green-500" />}
            label="Active Members"
            value={
              isInitialLoad
                ? "—"
                : `${insights?.membersWithTasks ?? 0}/${members.length}`
            }
            color="bg-green-500/10"
          />
        </div>

        {/* ── Sort controls ────────────────────────────────────────────────── */}
        {!isInitialLoad && sortedSpaces.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-cu-text-tertiary" />
            <span className="text-xs text-cu-text-tertiary">Sort by:</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortKey === key
                    ? "bg-cu-purple/10 text-cu-purple ring-1 ring-cu-purple/30"
                    : "text-cu-text-secondary hover:bg-cu-hover hover:text-cu-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Space cards grid ─────────────────────────────────────────────── */}
        {isInitialLoad ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SpaceCardSkeleton key={i} />
            ))}
          </div>
        ) : sortedSpaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cu-border py-20 text-center">
            <LayoutGrid className="h-9 w-9 text-cu-text-tertiary/40" />
            <div>
              <p className="text-sm font-medium text-cu-text-secondary">
                No spaces found
              </p>
              <p className="mt-1 text-xs text-cu-text-tertiary">
                Make sure CLICKUP_TEAM_ID is configured
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {sortedSpaces.map((space) => (
              <SpaceCard key={space.spaceId} space={space} />
            ))}
          </div>
        )}

        {/* ── Team overview (collapsible, collapsed by default) ────────────── */}
        {members.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-cu-border bg-cu-panel">
            <button
              onClick={() => setTeamExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-cu-hover"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cu-text-tertiary" />
                <span className="text-sm font-semibold text-cu-text">
                  Team Overview
                </span>
                <span className="rounded-full bg-cu-hover px-2 py-0.5 text-[10px] font-medium text-cu-text-secondary">
                  {members.length} members
                </span>
              </div>
              {teamExpanded ? (
                <ChevronUp className="h-4 w-4 text-cu-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-cu-text-tertiary" />
              )}
            </button>

            {teamExpanded && (
              <div className="border-t border-cu-border px-5 py-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {members.map(({ member, taskCount, metrics }) => (
                    <div
                      key={member.id}
                      className="flex flex-col items-center gap-2 rounded-xl border border-cu-border bg-cu-sidebar p-3 text-center"
                    >
                      <MemberAvatar member={member} size="md" />
                      <div className="w-full min-w-0">
                        <p className="truncate text-[11px] font-semibold text-cu-text">
                          {member.username ?? member.email.split("@")[0]}
                        </p>
                        <p className="text-[10px] text-cu-text-tertiary">
                          {taskCount} tasks
                        </p>
                      </div>
                      {metrics.score != null && (
                        <div
                          className={`w-full rounded-md py-0.5 text-[10px] font-bold ${scoreStyle(metrics.score)}`}
                        >
                          Score: {metrics.score}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
