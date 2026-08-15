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
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  SquareCheckBig,
  Clock,
  Users,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — mirror what /api/clickup/team-eval returns
// ---------------------------------------------------------------------------
interface MemberMetrics {
  score: number;
  completionRate: number;
  onTimeRate: number;
  activityRate: number;
  assigned: number;
  completed: number;
  overdue: number;
  inProgress: number;
  hoursLogged: number;
  avgTaskAge: number;
  spacesWorkedIn: string[];
  priorityBreakdown: { urgent: number; high: number; normal: number; low: number };
  trend: "up" | "down" | "stable";
}

interface EvalMember {
  id: number;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
  initials: string;
}

interface EvalResult {
  member: EvalMember;
  metrics: MemberMetrics;
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

// ---------------------------------------------------------------------------
// DateRangePicker
// ---------------------------------------------------------------------------
interface DateRange {
  start: string; // yyyy-MM-dd
  end: string;   // yyyy-MM-dd
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

function DateRangePicker({ value, onChange }: DateRangePickerProps) {
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
        const lastMonth = subMonths(today, 1);
        return {
          start: toInputValue(startOfMonth(lastMonth)),
          end: toInputValue(
            new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
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
      {/* Quick presets */}
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

      {/* Divider */}
      <span className="text-cu-text-tertiary">|</span>

      {/* Manual inputs */}
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
// Score badge
// ---------------------------------------------------------------------------
function ScoreBadge({ score }: { score: number }) {
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
      {score}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend arrow
// ---------------------------------------------------------------------------
function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")
    return <TrendingUp className="h-4 w-4 text-[#16a34a]" />;
  if (trend === "down")
    return <TrendingDown className="h-4 w-4 text-[#dc2626]" />;
  return <Minus className="h-4 w-4 text-cu-text-tertiary" />;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
function Avatar({
  member,
  size = 40,
}: {
  member: EvalMember;
  size?: number;
}) {
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
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "text-[14px] font-bold",
          warn ? "text-[#dc2626]" : "text-cu-text"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-cu-text-tertiary">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberCard
// ---------------------------------------------------------------------------
interface MemberCardProps {
  result: EvalResult;
  onClick: () => void;
}

function MemberCard({ result, onClick }: MemberCardProps) {
  const { member, metrics } = result;
  const displayName = member.username || member.email.split("@")[0];

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-xl border border-cu-border bg-cu-panel p-4 text-left shadow-sm transition-all hover:border-cu-purple hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cu-purple"
    >
      {/* Top row: avatar + name + score */}
      <div className="flex items-center gap-3">
        <Avatar member={member} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-cu-text" title={displayName}>
            {displayName}
          </p>
          <p className="truncate text-[11px] text-cu-text-tertiary" title={member.email}>
            {member.email}
          </p>
        </div>
        <ScoreBadge score={metrics.score} />
      </div>

      {/* Divider */}
      <div className="border-t border-cu-border" />

      {/* 3 key metrics */}
      <div className="flex items-center justify-around">
        <MetricChip
          label="Completion"
          value={`${Math.round(metrics.completionRate)}%`}
        />
        <div className="h-8 w-px bg-cu-border" />
        <MetricChip
          label="Overdue"
          value={String(metrics.overdue)}
          warn={metrics.overdue > 0}
        />
        <div className="h-8 w-px bg-cu-border" />
        <MetricChip
          label="Hours"
          value={
            metrics.hoursLogged >= 10
              ? `${Math.round(metrics.hoursLogged)}h`
              : `${metrics.hoursLogged.toFixed(1)}h`
          }
        />
      </div>

      {/* Trend */}
      <div className="flex items-center justify-end gap-1 text-[11px] text-cu-text-tertiary">
        <TrendIcon trend={metrics.trend} />
        <span>
          {metrics.trend === "up"
            ? "Trending up"
            : metrics.trend === "down"
            ? "Trending down"
            : "Stable"}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  loading?: boolean;
}

function KpiCard({ label, value, sub, icon: Icon, iconColor, loading }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm">
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
            <p className="text-xl font-bold text-cu-text">{value}</p>
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
// Sort + filter types
// ---------------------------------------------------------------------------
type SortKey = "score" | "name" | "completionRate" | "overdue" | "hours";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score",          label: "Score" },
  { value: "name",           label: "Name" },
  { value: "completionRate", label: "Completion Rate" },
  { value: "overdue",        label: "Overdue Count" },
  { value: "hours",          label: "Hours" },
];

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

  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");

  const startMs = msFromInput(dateRange.start);
  const endMs   = msFromInput(dateRange.end);

  const { data, isLoading, error, refetch, isFetching } = useQuery<EvalResult[]>({
    queryKey: ["team-eval", dateRange.start, dateRange.end],
    queryFn: async () => {
      const url = `/api/clickup/team-eval?start=${startMs}&end=${endMs}`;
      const r = await fetch(url);
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch {/* */}
        throw new Error(body || `HTTP ${r.status}`);
      }
      return r.json() as Promise<EvalResult[]>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Collect unique space IDs from all results for the filter dropdown
  const allSpaces = useMemo<string[]>(() => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const r of data) {
      for (const s of r.metrics.spacesWorkedIn) ids.add(s);
    }
    return ["all", ...ids];
  }, [data]);

  // Apply filter
  const filtered = useMemo<EvalResult[]>(() => {
    if (!data) return [];
    if (spaceFilter === "all") return data;
    return data.filter((r) => r.metrics.spacesWorkedIn.includes(spaceFilter));
  }, [data, spaceFilter]);

  // Apply sort
  const sorted = useMemo<EvalResult[]>(() => {
    const copy = [...filtered];
    switch (sortKey) {
      case "score":
        return copy.sort((a, b) => b.metrics.score - a.metrics.score);
      case "name": {
        const name = (r: EvalResult) =>
          r.member.username || r.member.email.split("@")[0];
        return copy.sort((a, b) => name(a).localeCompare(name(b)));
      }
      case "completionRate":
        return copy.sort(
          (a, b) => b.metrics.completionRate - a.metrics.completionRate
        );
      case "overdue":
        return copy.sort((a, b) => b.metrics.overdue - a.metrics.overdue);
      case "hours":
        return copy.sort(
          (a, b) => b.metrics.hoursLogged - a.metrics.hoursLogged
        );
    }
  }, [filtered, sortKey]);

  // Aggregate KPIs
  const kpis = useMemo(() => {
    if (!data || data.length === 0)
      return { totalTasks: 0, avgCompletion: 0, totalOverdue: 0, totalHours: 0 };
    const totalTasks = data.reduce((s, r) => s + r.metrics.assigned, 0);
    const avgCompletion =
      data.reduce((s, r) => s + r.metrics.completionRate, 0) / data.length;
    const totalOverdue = data.reduce((s, r) => s + r.metrics.overdue, 0);
    const totalHours = data.reduce((s, r) => s + r.metrics.hoursLogged, 0);
    return { totalTasks, avgCompletion, totalOverdue, totalHours };
  }, [data]);

  // Human-readable period label
  const periodLabel = `${format(fromInputValue(dateRange.start), "MMM d")} – ${format(
    fromInputValue(dateRange.end),
    "MMM d, yyyy"
  )}`;

  const hasError = !!error;
  const errMessage = hasError
    ? String(error).replace(/^Error:\s*/, "")
    : null;

  function navigateToMember(memberId: number) {
    router.push(
      `/team/${memberId}?start=${dateRange.start}&end=${dateRange.end}`
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
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

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* ── Controls row ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <div className="flex items-center gap-2">
            {/* Sort selector */}
            <div className="relative">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="appearance-none rounded-lg border border-cu-border bg-cu-panel py-1.5 pl-3 pr-8 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Sort: {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cu-text-tertiary" />
            </div>

            {/* Space filter */}
            {allSpaces.length > 1 && (
              <div className="relative">
                <select
                  value={spaceFilter}
                  onChange={(e) => setSpaceFilter(e.target.value)}
                  className="appearance-none rounded-lg border border-cu-border bg-cu-panel py-1.5 pl-3 pr-8 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
                >
                  {allSpaces.map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "All Spaces" : `Space ${s}`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cu-text-tertiary" />
              </div>
            )}
          </div>
        </div>

        {/* ── KPI summary cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Total Tasks"
            value={isLoading ? "—" : kpis.totalTasks}
            icon={SquareCheckBig}
            iconColor="#7b68ee"
            loading={isLoading}
          />
          <KpiCard
            label="Avg Completion"
            value={
              isLoading ? "—" : `${Math.round(kpis.avgCompletion)}%`
            }
            sub={`${sorted.length} member${sorted.length !== 1 ? "s" : ""}`}
            icon={Users}
            iconColor="#0ea5e9"
            loading={isLoading}
          />
          <KpiCard
            label="Team Overdue"
            value={isLoading ? "—" : kpis.totalOverdue}
            icon={AlertTriangle}
            iconColor="#ef4444"
            loading={isLoading}
          />
          <KpiCard
            label="Total Hours"
            value={
              isLoading
                ? "—"
                : kpis.totalHours >= 10
                ? `${Math.round(kpis.totalHours)}h`
                : `${kpis.totalHours.toFixed(1)}h`
            }
            icon={Clock}
            iconColor="#10b981"
            loading={isLoading}
          />
        </div>

        {/* ── Team grid ────────────────────────────────────────────────── */}
        {isLoading ? (
          <GridSkeleton />
        ) : sorted.length === 0 ? (
          <EmptyState hasFilter={spaceFilter !== "all"} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((result) => (
              <MemberCard
                key={result.member.id}
                result={result}
                onClick={() => navigateToMember(result.member.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-cu-border bg-cu-panel p-4 shadow-sm"
        >
          {/* Avatar + name */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-cu-hover" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 rounded bg-cu-hover" />
              <div className="h-2.5 w-20 rounded bg-cu-hover" />
            </div>
            <div className="h-10 w-10 shrink-0 rounded-full bg-cu-hover" />
          </div>
          {/* Divider */}
          <div className="mb-3 h-px bg-cu-hover" />
          {/* Metrics row */}
          <div className="mb-3 flex justify-around">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex flex-col items-center gap-1">
                <div className="h-4 w-8 rounded bg-cu-hover" />
                <div className="h-2.5 w-14 rounded bg-cu-hover" />
              </div>
            ))}
          </div>
          {/* Trend */}
          <div className="flex justify-end">
            <div className="h-3 w-20 rounded bg-cu-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cu-border py-16 text-center">
      <Users className="h-8 w-8 text-cu-text-tertiary" />
      <p className="text-[14px] font-medium text-cu-text">No team members found</p>
      <p className="text-[13px] text-cu-text-tertiary">
        {hasFilter
          ? "No members worked in the selected space during this period."
          : "No team member data is available for this period."}
      </p>
    </div>
  );
}
