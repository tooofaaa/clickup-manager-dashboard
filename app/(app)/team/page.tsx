"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  startOfMonth,
  startOfQuarter,
  subMonths,
  format,
  parseISO,
} from "date-fns";
import {
  RefreshCw,
  AlertTriangle,
  SquareCheckBig,
  Clock,
  Users,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — mirror the NEW /api/clickup/team-eval response shape
// ---------------------------------------------------------------------------
interface MemberInfo {
  id: string;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
  initials: string;
}

interface MemberMetrics {
  score: number | null;
  completionRate: number;
  overdueRate: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  hoursLogged: number;
}

interface TeamMember {
  member: MemberInfo;
  taskCount: number;
  metrics: MemberMetrics;
}

interface SpaceHealth {
  spaceId: string;
  spaceName: string;
  color: string | null;
  total: number;
  closed: number;
  overdue: number;
  pct: number;
}

interface TeamInsights {
  totalTasks: number;
  unassignedTasks: number;
  overdueTotal: number;
  tasksByStatus: { open: number; custom: number; closed: number };
  tasksBySpace: SpaceHealth[];
  membersWithTasks: number;
  membersWithoutTasks: number;
}

interface TeamEvalResponse {
  members: TeamMember[];
  insights: TeamInsights;
  period: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------
function toInputValue(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function fromInputValue(s: string): Date {
  try {
    return parseISO(s);
  } catch {
    return new Date();
  }
}

function msFromInput(s: string): number {
  return fromInputValue(s).getTime();
}

interface DateRange {
  start: string;
  end: string;
}

// ---------------------------------------------------------------------------
// DateRangePicker
// ---------------------------------------------------------------------------
function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const today = new Date();

  const presets = [
    {
      label: "This Month",
      getRange: () => ({
        start: toInputValue(startOfMonth(today)),
        end: toInputValue(today),
      }),
    },
    {
      label: "Last Month",
      getRange: () => {
        const last = subMonths(today, 1);
        return {
          start: toInputValue(startOfMonth(last)),
          end: toInputValue(
            new Date(last.getFullYear(), last.getMonth() + 1, 0)
          ),
        };
      },
    },
    {
      label: "This Quarter",
      getRange: () => ({
        start: toInputValue(startOfQuarter(today)),
        end: toInputValue(today),
      }),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => {
        const r = p.getRange();
        const active = r.start === value.start && r.end === value.end;
        return (
          <button
            key={p.label}
            onClick={() => onChange(r)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "border-cu-purple bg-cu-purple-light text-cu-purple"
                : "border-cu-border text-cu-text-secondary hover:bg-cu-hover"
            )}
          >
            {p.label}
          </button>
        );
      })}

      <span className="text-cu-text-tertiary">|</span>

      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-cu-text-tertiary">From</span>
        <input
          type="date"
          value={value.start}
          max={value.end}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          className="rounded-lg border border-cu-border bg-cu-panel px-2 py-1 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
        />
        <span className="text-[12px] text-cu-text-tertiary">to</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={toInputValue(new Date())}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          className="rounded-lg border border-cu-border bg-cu-panel px-2 py-1 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
function Avatar({ member, size = 40 }: { member: MemberInfo; size?: number }) {
  const bg = member.color ?? "#7b68ee";
  const style = {
    width: size,
    height: size,
    minWidth: size,
    backgroundColor: bg,
    fontSize: size * 0.36,
  };

  if (member.profilePicture) {
    return (
      <img
        src={member.profilePicture}
        alt={member.username ?? member.email}
        className="shrink-0 rounded-full object-cover"
        style={style}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={style}
    >
      {member.initials || "?"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score badge — circle, coloured by value (null → gray)
// ---------------------------------------------------------------------------
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={{
          backgroundColor: "var(--cu-hover)",
          color: "var(--cu-text-tertiary)",
          boxShadow: "0 0 0 2px var(--cu-border)",
        }}
      >
        —
      </div>
    );
  }

  const color =
    score >= 70
      ? { bg: "#dcfce7", text: "#166534", ring: "#86efac" }
      : score >= 40
      ? { bg: "#fef9c3", text: "#854d0e", ring: "#fde047" }
      : { bg: "#fee2e2", text: "#991b1b", ring: "#fca5a5" };

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{
        backgroundColor: color.bg,
        color: color.text,
        boxShadow: `0 0 0 2px ${color.ring}`,
      }}
    >
      {Math.round(score)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric chip
// ---------------------------------------------------------------------------
function MetricChip({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        warn
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-cu-border bg-cu-hover text-cu-text-secondary"
      )}
    >
      <span className={cn("font-bold", warn ? "text-red-700" : "text-cu-text")}>
        {value}
      </span>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion bar
// ---------------------------------------------------------------------------
function CompletionBar({ pct }: { pct: number }) {
  const clipped = Math.min(100, Math.max(0, pct));
  const color =
    clipped >= 70
      ? "#16a34a"
      : clipped >= 40
      ? "#d97706"
      : "#dc2626";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 overflow-hidden rounded-full bg-cu-hover" style={{ height: 5 }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clipped}%`, backgroundColor: color }}
        />
      </div>
      <span className="shrink-0 text-[11px] text-cu-text-tertiary">{Math.round(clipped)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberCard (for members with tasks)
// ---------------------------------------------------------------------------
function MemberCard({
  entry,
  onClick,
}: {
  entry: TeamMember;
  onClick: () => void;
}) {
  const { member, taskCount, metrics } = entry;
  const displayName = member.username ?? member.email.split("@")[0];

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-xl border border-cu-border bg-cu-panel p-4 text-left shadow-sm transition-all hover:border-cu-purple hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cu-purple"
    >
      {/* Top row: avatar + name + score */}
      <div className="flex items-center gap-3">
        <Avatar member={member} size={40} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-semibold text-cu-text"
            title={displayName}
          >
            {displayName}
          </p>
          <p
            className="truncate text-[11px] text-cu-text-tertiary"
            title={member.email}
          >
            {member.email}
          </p>
        </div>
        <ScoreBadge score={metrics.score} />
      </div>

      {/* Divider */}
      <div className="border-t border-cu-border" />

      {/* Metric chips */}
      <div className="flex flex-wrap gap-1.5">
        <MetricChip label="assigned" value={String(taskCount)} />
        <MetricChip label="done" value={String(metrics.completed)} />
        <MetricChip label="in progress" value={String(metrics.inProgress)} />
        <MetricChip
          label="overdue"
          value={String(metrics.overdue)}
          warn={metrics.overdue > 0}
        />
      </div>

      {/* Completion bar */}
      <CompletionBar pct={metrics.completionRate} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  loading,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  loading?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-cu-panel px-4 py-3 shadow-sm",
        warn ? "border-red-200" : "border-cu-border"
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cu-hover">
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
      </span>
      <div className="min-w-0">
        {loading ? (
          <>
            <div className="mb-1 h-5 w-10 animate-pulse rounded bg-cu-hover" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-cu-hover" />
          </>
        ) : (
          <>
            <p
              className={cn(
                "text-xl font-bold",
                warn ? "text-red-600" : "text-cu-text"
              )}
            >
              {value}
            </p>
            <p className="truncate text-[11px] text-cu-text-tertiary">
              {sub ? `${label} · ${sub}` : label}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Health table
// ---------------------------------------------------------------------------
function SpaceHealthTable({ spaces }: { spaces: SpaceHealth[] }) {
  const sorted = [...spaces].sort((a, b) => b.total - a.total);

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
      <div className="border-b border-cu-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-cu-text">Space Health</h2>
        <p className="text-[11px] text-cu-text-tertiary">
          Where work is happening this period
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-cu-border bg-cu-hover">
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">Space</th>
              <th className="px-4 py-2.5 text-right font-medium text-cu-text-secondary">Total</th>
              <th className="px-4 py-2.5 text-right font-medium text-cu-text-secondary">Closed</th>
              <th className="px-4 py-2.5 text-right font-medium text-cu-text-secondary">Overdue</th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary min-w-[140px]">
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const pct = Math.min(100, Math.max(0, s.pct));
              const barColor =
                pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
              return (
                <tr
                  key={s.spaceId}
                  className="border-b border-cu-border last:border-b-0 hover:bg-cu-hover transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color ?? "#7b68ee" }}
                      />
                      <span className="font-medium text-cu-text">{s.spaceName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-cu-text">
                    {s.total}
                  </td>
                  <td className="px-4 py-2.5 text-right text-cu-text-secondary">
                    {s.closed}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "font-medium",
                        s.overdue > 0 ? "text-red-600" : "text-cu-text-secondary"
                      )}
                    >
                      {s.overdue}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 overflow-hidden rounded-full bg-cu-hover"
                        style={{ height: 6 }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span className="shrink-0 w-8 text-right text-cu-text-tertiary">
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-cu-text-tertiary">
            No space data for this period
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact member row (no tasks)
// ---------------------------------------------------------------------------
function MemberRow({ member }: { member: MemberInfo }) {
  const displayName = member.username ?? member.email.split("@")[0];
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-cu-hover transition-colors">
      <Avatar member={member} size={28} />
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-cu-text truncate block">
          {displayName}
        </span>
      </div>
      <span className="shrink-0 text-[11px] text-cu-text-tertiary truncate max-w-[180px]">
        {member.email}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function PageSkeleton() {
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm"
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-cu-hover" />
            <div className="flex-1 space-y-1.5">
              <div className="h-5 w-10 animate-pulse rounded bg-cu-hover" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-cu-hover" />
            </div>
          </div>
        ))}
      </div>
      {/* Space table skeleton */}
      <div className="h-40 animate-pulse rounded-xl border border-cu-border bg-cu-panel" />
      {/* Member grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-cu-border bg-cu-panel p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-cu-hover" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 rounded bg-cu-hover" />
                <div className="h-2.5 w-20 rounded bg-cu-hover" />
              </div>
              <div className="h-10 w-10 shrink-0 rounded-full bg-cu-hover" />
            </div>
            <div className="mb-3 h-px bg-cu-hover" />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-5 w-16 rounded-full bg-cu-hover" />
              ))}
            </div>
            <div className="h-2 rounded-full bg-cu-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TeamEvalPage() {
  const router = useRouter();
  const today = new Date();

  const [dateRange, setDateRange] = useState<DateRange>({
    start: toInputValue(startOfMonth(today)),
    end: toInputValue(today),
  });

  const startMs = msFromInput(dateRange.start);
  const endMs = msFromInput(dateRange.end);

  const { data, isLoading, error, refetch, isFetching } =
    useQuery<TeamEvalResponse>({
      queryKey: ["team-eval", dateRange.start, dateRange.end],
      queryFn: async () => {
        const url = `/api/clickup/team-eval?start=${startMs}&end=${endMs}`;
        const r = await fetch(url);
        if (!r.ok) {
          let body = "";
          try {
            body = await r.text();
          } catch {
            /* */
          }
          throw new Error(body || `HTTP ${r.status}`);
        }
        return r.json() as Promise<TeamEvalResponse>;
      },
      staleTime: 5 * 60 * 1000,
      retry: 1,
    });

  const hasError = !!error;
  const errMessage = hasError ? String(error).replace(/^Error:\s*/, "") : null;

  // Split members into with-tasks and without-tasks
  const withTasks = useMemo<TeamMember[]>(() => {
    if (!data) return [];
    return [...data.members.filter((m) => m.taskCount > 0)].sort((a, b) => {
      const sa = a.metrics.score;
      const sb = b.metrics.score;
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    });
  }, [data]);

  const withoutTasks = useMemo<TeamMember[]>(() => {
    if (!data) return [];
    return data.members.filter((m) => m.taskCount === 0);
  }, [data]);

  const insights = data?.insights;

  const periodLabel = `${format(fromInputValue(dateRange.start), "MMM d")} – ${format(
    fromInputValue(dateRange.end),
    "MMM d, yyyy"
  )}`;

  function navigateToMember(memberId: string) {
    router.push(
      `/team/${memberId}?start=${new Date(dateRange.start).getTime()}&end=${new Date(dateRange.end).getTime()}`
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div>
          <h1 className="text-[16px] font-bold text-cu-text">Team Evaluation</h1>
          <p className="text-[12px] text-cu-text-tertiary">
            Live from ClickUp · {periodLabel}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[13px] text-cu-text-secondary hover:bg-cu-hover disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {hasError && (
        <div className="shrink-0 border-b border-[#fca5a5] bg-[#fef2f2] px-6 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#ef4444]" />
              <p className="shrink-0 text-[13px] font-medium text-[#991b1b]">
                Failed to load team evaluation
              </p>
              {errMessage && (
                <span className="hidden truncate text-[12px] text-[#b91c1c] sm:block">
                  — {errMessage}
                </span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              className="shrink-0 rounded-lg border border-[#fca5a5] bg-white px-3 py-1 text-[12px] font-medium text-[#991b1b] hover:bg-[#fef2f2]"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Date range picker */}
        <DateRangePicker value={dateRange} onChange={setDateRange} />

        {isLoading ? (
          <PageSkeleton />
        ) : (
          <>
            {/* ── 5-card KPI row ───────────────────────────────────────── */}
            {insights && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <KpiCard
                  label="Total Tasks"
                  value={insights.totalTasks}
                  icon={SquareCheckBig}
                  iconColor="#7b68ee"
                />
                <KpiCard
                  label="Unassigned"
                  value={insights.unassignedTasks}
                  icon={Users}
                  iconColor={
                    insights.unassignedTasks > insights.totalTasks / 2
                      ? "#dc2626"
                      : "#0ea5e9"
                  }
                  warn={insights.unassignedTasks > insights.totalTasks / 2}
                />
                <KpiCard
                  label="Overdue"
                  value={insights.overdueTotal}
                  icon={AlertTriangle}
                  iconColor={insights.overdueTotal > 0 ? "#dc2626" : "#10b981"}
                  warn={insights.overdueTotal > 0}
                />
                <KpiCard
                  label="Active Members"
                  value={`${insights.membersWithTasks} / ${data.members.length}`}
                  sub="of team"
                  icon={Users}
                  iconColor="#f59e0b"
                />
                <KpiCard
                  label="Completed"
                  value={insights.tasksByStatus.closed}
                  icon={CheckCheck}
                  iconColor="#16a34a"
                />
              </div>
            )}

            {/* ── Space Health table ───────────────────────────────────── */}
            {insights && insights.tasksBySpace.length > 0 && (
              <SpaceHealthTable spaces={insights.tasksBySpace} />
            )}

            {/* ── Members with tasks ──────────────────────────────────── */}
            {withTasks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-cu-text">
                    Members with assigned tasks
                  </h2>
                  <span className="rounded-full bg-cu-hover px-2 py-0.5 text-[11px] font-medium text-cu-text-secondary">
                    {withTasks.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {withTasks.map((entry) => (
                    <MemberCard
                      key={entry.member.id}
                      entry={entry}
                      onClick={() => navigateToMember(entry.member.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Members without tasks ───────────────────────────────── */}
            {withoutTasks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-cu-text">
                    Team members
                  </h2>
                  <span className="rounded-full bg-cu-hover px-2 py-0.5 text-[11px] font-medium text-cu-text-secondary">
                    {withoutTasks.length}
                  </span>
                  <span className="text-[11px] text-cu-text-tertiary">
                    — no tasks assigned this period
                  </span>
                </div>
                <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm divide-y divide-cu-border overflow-hidden">
                  {withoutTasks.map((entry) => (
                    <MemberRow key={entry.member.id} member={entry.member} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty state ─────────────────────────────────────────── */}
            {(!insights || data?.members.length === 0) && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cu-border py-16 text-center">
                <Users className="h-8 w-8 text-cu-text-tertiary" />
                <p className="text-[14px] font-medium text-cu-text">
                  No team data available
                </p>
                <p className="text-[13px] text-cu-text-tertiary">
                  No data was returned for this period.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
