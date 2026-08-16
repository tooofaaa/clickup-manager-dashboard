"use client";

import {
  useState,
  useEffect,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Timer,
  TrendingUp,
  BarChart3,
  CalendarDays,
  Circle,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CUTask } from "@/lib/clickup-client";
import { ActivityHeatmap } from "@/components/eval/activity-heatmap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberInfo {
  id: number;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
  initials: string;
}

interface MemberMetrics {
  score: number | null;
  completionRate: number;
  onTimeRate: number;
  totalAssigned: number;
  overdue: number;
  hoursLogged: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

interface SpaceBreakdownEntry {
  spaceId: string;
  spaceName: string;
  taskCount: number;
  color: string;
}

interface VelocityEntry {
  weekStart: string;
  completed: number;
}

interface PriorityBreakdown {
  urgent: number;
  high: number;
  normal: number;
  low: number;
  none: number;
}

interface MemberProfileData {
  member: MemberInfo;
  activity: {
    completedInPeriod: CUTask[];
    assignedInPeriod: CUTask[];
    dueInPeriod: CUTask[];
    lateCompletions: CUTask[];
  };
  workload: {
    allAssigned: CUTask[];
    inProgress: CUTask[];
    overdue: CUTask[];
    notStarted: CUTask[];
    upcoming: CUTask[];
  };
  metrics: MemberMetrics;
  activityHeatmap: Record<string, number>;
  spaceBreakdown: SpaceBreakdownEntry[];
  velocityByWeek: VelocityEntry[];
  priorityBreakdown: PriorityBreakdown;
  period: { start: number; end: number };
}

type Mode = "activity" | "workload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number | null): string {
  if (score === null || score === 0) return "#9ca3af";
  if (score < 40) return "#ef4444";
  if (score < 70) return "#f59e0b";
  return "#22c55e";
}

function scoreBg(score: number | null): string {
  if (score === null || score === 0) return "rgba(156,163,175,0.15)";
  if (score < 40) return "rgba(239,68,68,0.12)";
  if (score < 70) return "rgba(245,158,11,0.12)";
  return "rgba(34,197,94,0.12)";
}

function formatMs(ms: string | number | null | undefined): string {
  if (!ms) return "—";
  const n = Number(ms);
  if (isNaN(n)) return "—";
  return format(new Date(n), "MMM d, yyyy");
}

function isOverdue(task: CUTask): boolean {
  return !!(
    task.due_date &&
    Number(task.due_date) < Date.now() &&
    task.status.type !== "closed"
  );
}

function daysLate(task: CUTask): number {
  const closedAt = task.date_closed ?? task.date_done;
  const due = task.due_date;
  if (!closedAt || !due) return 0;
  const diff = Number(closedAt) - Number(due);
  return Math.max(0, Math.round(diff / 86_400_000));
}

function shortWeek(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  return format(d, "MMM d");
}

function startOfMonth(offset = 0): number {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfMonth(offset: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfYear(): number {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ member, size = 64 }: { member: MemberInfo; size?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.36,
    background: member.color ?? "#7b68ee",
  };
  if (member.profilePicture) {
    return (
      <img
        src={member.profilePicture}
        alt={member.username ?? member.email}
        className="rounded-full object-cover ring-2 ring-cu-border"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-cu-border"
      style={style}
    >
      {member.initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

function ScoreRing({ score }: { score: number | null }) {
  const isNull = score === null;
  const effectiveScore = score ?? 0;
  const color = isNull ? "#9ca3af" : scoreColor(effectiveScore);
  const bg = isNull ? "rgba(156,163,175,0.15)" : scoreBg(effectiveScore);
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = isNull
    ? circumference
    : circumference * (1 - Math.max(0, Math.min(100, effectiveScore)) / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
        <svg width="72" height="72" className="-rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill={bg} stroke="var(--cu-border)" strokeWidth="2" />
          <circle
            cx="36" cy="36" r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[18px] font-bold" style={{ color }}>
          {isNull ? "—" : score}
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-cu-text-tertiary">
        Score
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric tile
// ---------------------------------------------------------------------------

function MetricTile({
  label,
  value,
  icon: Icon,
  color,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1.5 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm min-w-0",
        highlight && "border-cu-purple",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: color ?? "var(--cu-text-tertiary)" }} />
        <span className="truncate text-[11px] font-medium text-cu-text-tertiary">{label}</span>
      </div>
      <span
        className="text-[20px] font-bold leading-none tracking-tight text-cu-text"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ task }: { task: CUTask }) {
  return (
    <span
      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
      style={{ background: task.status.color ?? "var(--cu-text-tertiary)" }}
      title={task.status.status}
    />
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task, showLate }: { task: CUTask; showLate?: boolean }) {
  const late = showLate ? daysLate(task) : 0;
  const overdue = !showLate && isOverdue(task);

  return (
    <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-cu-hover group">
      <StatusDot task={task} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline underline-offset-2"
          >
            {task.name}
          </a>
          <ExternalLink className="h-3 w-3 shrink-0 text-cu-text-tertiary opacity-0 group-hover:opacity-100" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-cu-text-tertiary">
          <span className="truncate max-w-[120px]">{task.list.name}</span>
          {task.due_date && (
            <>
              <span className="text-cu-border">·</span>
              <span className={overdue ? "font-medium text-cu-urgent" : ""}>
                {overdue ? "Overdue · " : ""}
                {formatMs(task.due_date)}
              </span>
            </>
          )}
          {showLate && late > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              {late}d late
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-1.5">
      <ListTodo className="h-5 w-5 text-cu-text-tertiary opacity-40" />
      <p className="text-[12px] text-cu-text-tertiary">No tasks in this period</p>
      <p className="text-[11px] text-cu-text-tertiary opacity-60">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task tabs (mode-aware)
// ---------------------------------------------------------------------------

type ActivityTabId = "completedInPeriod" | "assignedInPeriod" | "dueInPeriod" | "lateCompletions";
type WorkloadTabId = "allAssigned" | "inProgress" | "overdue" | "notStarted" | "upcoming";

function ActivityTabs({
  activity,
  activeTab,
  setActiveTab,
}: {
  activity: MemberProfileData["activity"];
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  const tabs: { id: ActivityTabId; label: string }[] = [
    { id: "completedInPeriod", label: "Completed" },
    { id: "assignedInPeriod",  label: "Assigned" },
    { id: "dueInPeriod",       label: "Due in Period" },
    { id: "lateCompletions",   label: "Late Completions" },
  ];

  const current = (activeTab as ActivityTabId) in activity ? (activeTab as ActivityTabId) : "completedInPeriod";
  const list = activity[current] ?? [];

  return (
    <div>
      <div className="flex items-center gap-0 border-b border-cu-border px-4 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors",
              current === t.id
                ? "border-cu-purple text-cu-purple"
                : "border-transparent text-cu-text-secondary hover:text-cu-text",
            )}
          >
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              current === t.id ? "bg-cu-purple-light text-cu-purple" : "bg-cu-hover text-cu-text-tertiary",
            )}>
              {activity[t.id].length}
            </span>
          </button>
        ))}
      </div>
      <div className="max-h-96 overflow-y-auto px-2 py-2">
        {list.length === 0 ? (
          <EmptyTab label={tabs.find(t => t.id === current)?.label ?? ""} />
        ) : (
          list.map(task => (
            <TaskRow key={task.id} task={task} showLate={current === "lateCompletions"} />
          ))
        )}
      </div>
    </div>
  );
}

function WorkloadTabs({
  workload,
  activeTab,
  setActiveTab,
}: {
  workload: MemberProfileData["workload"];
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  const tabs: { id: WorkloadTabId; label: string }[] = [
    { id: "allAssigned", label: "All Assigned" },
    { id: "inProgress",  label: "In Progress" },
    { id: "overdue",     label: "Overdue" },
    { id: "notStarted",  label: "Not Started" },
    { id: "upcoming",    label: "Upcoming" },
  ];

  const current = (activeTab as WorkloadTabId) in workload ? (activeTab as WorkloadTabId) : "allAssigned";
  const list = workload[current] ?? [];

  return (
    <div>
      <div className="flex items-center gap-0 border-b border-cu-border px-4 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors",
              current === t.id
                ? "border-cu-purple text-cu-purple"
                : "border-transparent text-cu-text-secondary hover:text-cu-text",
            )}
          >
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              current === t.id ? "bg-cu-purple-light text-cu-purple" : "bg-cu-hover text-cu-text-tertiary",
            )}>
              {workload[t.id].length}
            </span>
          </button>
        ))}
      </div>
      <div className="max-h-96 overflow-y-auto px-2 py-2">
        {list.length === 0 ? (
          <EmptyTab label={tabs.find(t => t.id === current)?.label ?? ""} />
        ) : (
          list.map(task => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space breakdown
// ---------------------------------------------------------------------------

function SpaceBreakdown({ breakdown }: { breakdown: SpaceBreakdownEntry[] }) {
  if (breakdown.length === 0) {
    return <div className="text-[12px] text-cu-text-tertiary">No space data</div>;
  }
  const maxCount = Math.max(1, ...breakdown.map(s => s.taskCount));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Space breakdown</span>
      </div>
      <div className="space-y-2">
        {breakdown.map(space => (
          <div key={space.spaceId} className="flex items-center gap-2 min-w-0">
            <span className="w-[120px] shrink-0 truncate text-[11px] text-cu-text-secondary">
              {space.spaceName}
            </span>
            <div className="relative flex-1 h-4 rounded-full bg-cu-hover overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((space.taskCount / maxCount) * 100)}%`,
                  background: space.color ?? "var(--cu-purple)",
                  opacity: 0.75,
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[11px] font-semibold text-cu-text">
              {space.taskCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly velocity
// ---------------------------------------------------------------------------

function WeeklyVelocity({ velocity }: { velocity: VelocityEntry[] }) {
  const maxVal = Math.max(1, ...velocity.map(v => v.completed));

  if (velocity.length === 0) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-cu-text-tertiary" />
          <span className="text-[12px] font-semibold text-cu-text">Weekly velocity</span>
        </div>
        <div className="text-[12px] text-cu-text-tertiary">No velocity data</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Weekly velocity</span>
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {velocity.map((week, i) => {
          const heightPct = (week.completed / maxVal) * 76;
          return (
            <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1 group">
              <span className="text-[9px] font-semibold text-cu-text opacity-0 group-hover:opacity-100">
                {week.completed}
              </span>
              <div
                title={`${shortWeek(week.weekStart)}: ${week.completed} completed`}
                className="w-full rounded-t-sm"
                style={{
                  height: `${Math.max(2, Math.round(heightPct))}px`,
                  background: i === velocity.length - 1
                    ? "var(--cu-purple)"
                    : "var(--cu-purple-light)",
                  border: i === velocity.length - 1
                    ? "1px solid var(--cu-purple)"
                    : "1px solid var(--cu-border)",
                  minHeight: "2px",
                }}
              />
              <span className="text-[8px] text-cu-text-tertiary leading-none truncate w-full text-center">
                {shortWeek(week.weekStart).split(" ")[1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority breakdown
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--cu-urgent)",
  high:   "var(--cu-high)",
  normal: "var(--cu-normal)",
  low:    "var(--cu-low)",
  none:   "var(--cu-text-tertiary)",
};

const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;

function PriorityBreakdown({ breakdown }: { breakdown: PriorityBreakdown }) {
  const total = Math.max(
    1,
    breakdown.urgent + breakdown.high + breakdown.normal + breakdown.low + breakdown.none,
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Circle className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Priority breakdown</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {PRIORITY_ORDER.map(p => {
          const pct = Math.round((breakdown[p] / total) * 100);
          if (pct === 0) return null;
          return (
            <div
              key={p}
              title={`${p}: ${breakdown[p]}`}
              style={{ width: `${pct}%`, background: PRIORITY_COLORS[p] }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {PRIORITY_ORDER.map(p => (
          <div key={p} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[p] }} />
            <span className="text-[11px] text-cu-text-secondary capitalize">{p}</span>
            <span className="text-[11px] font-semibold text-cu-text">{breakdown[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date range picker
// ---------------------------------------------------------------------------

const PRESETS: { label: string; getRange: () => [number, number] }[] = [
  {
    label: "This Month",
    getRange: () => [startOfMonth(0), Date.now()],
  },
  {
    label: "Last Month",
    getRange: () => [startOfMonth(-1), endOfMonth(-1)],
  },
  {
    label: "Last 3 Months",
    getRange: () => [startOfMonth(-3), Date.now()],
  },
  {
    label: "This Year",
    getRange: () => [startOfYear(), Date.now()],
  },
];

function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  function toInputDate(ms: number): string {
    return new Date(ms).toISOString().split("T")[0];
  }

  function fromInputDate(s: string, fallback: number): number {
    const n = new Date(s).getTime();
    return isNaN(n) ? fallback : n;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => { const [s, e] = p.getRange(); onChange(s, e); }}
          className="rounded-lg border border-cu-border bg-cu-bg px-2.5 py-1 text-[11px] font-medium text-cu-text-secondary hover:bg-cu-hover hover:text-cu-text transition-colors"
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={toInputDate(start)}
          onChange={e => onChange(fromInputDate(e.target.value, start), end)}
          className="rounded-lg border border-cu-border bg-cu-bg px-2 py-1 text-[12px] text-cu-text focus:border-cu-purple focus:outline-none"
        />
        <span className="text-[11px] text-cu-text-tertiary">→</span>
        <input
          type="date"
          value={toInputDate(end)}
          onChange={e => onChange(start, fromInputDate(e.target.value, end))}
          className="rounded-lg border border-cu-border bg-cu-bg px-2 py-1 text-[12px] text-cu-text focus:border-cu-purple focus:outline-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div className="h-4 w-24 animate-pulse rounded bg-cu-hover" />
      </div>
      <div className="shrink-0 border-b border-cu-border bg-cu-sidebar px-6 py-6">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 animate-pulse rounded-full bg-cu-hover" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-cu-hover" />
            <div className="h-3 w-24 animate-pulse rounded bg-cu-hover" />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 flex-1 animate-pulse rounded-xl bg-cu-hover" />
          ))}
        </div>
      </div>
      <div className="flex-1 px-6 py-4 space-y-4">
        <div className="h-12 animate-pulse rounded-xl bg-cu-hover" />
        <div className="h-64 animate-pulse rounded-xl bg-cu-hover" />
        <div className="h-40 animate-pulse rounded-xl bg-cu-hover" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-cu-urgent" />
      <div>
        <p className="text-[14px] font-semibold text-cu-text">Failed to load member profile</p>
        <p className="mt-1 text-[12px] text-cu-text-tertiary">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-4 py-1.5 text-[12px] text-cu-text-secondary hover:bg-cu-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to team
          </button>
        )}
        <button
          onClick={onRetry}
          className="rounded-lg border border-cu-border px-4 py-1.5 text-[12px] text-cu-text-secondary hover:bg-cu-hover"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MemberProfilePage() {
  const params       = useParams<{ memberId: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const memberId = params.memberId;

  // ── State ──────────────────────────────────────────────────────────────────

  const [mode, setModeState] = useState<Mode>(() => {
    const raw = searchParams.get("mode");
    return raw === "workload" ? "workload" : "activity";
  });

  const [dateRange, setDateRange] = useState<{ start: number; end: number }>(() => {
    const s = searchParams.get("start");
    const e = searchParams.get("end");
    return {
      start: s && !isNaN(Number(s)) ? Number(s) : startOfMonth(0),
      end:   e && !isNaN(Number(e)) ? Number(e) : Date.now(),
    };
  });

  const [activeTab, setActiveTab] = useState<string>("completedInPeriod");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // When mode changes, reset to first tab of that mode
  function setMode(m: Mode) {
    setModeState(m);
    setActiveTab(m === "activity" ? "completedInPeriod" : "allAssigned");
  }

  // ── Sync URL ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("start", String(dateRange.start));
    url.searchParams.set("end",   String(dateRange.end));
    url.searchParams.set("mode",  mode);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [dateRange.start, dateRange.end, mode, router]);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const { data, isLoading, error, refetch } = useQuery<MemberProfileData>({
    queryKey: ["member", memberId, dateRange.start, dateRange.end],
    queryFn: async () => {
      const url = `/api/clickup/member/${memberId}?start=${dateRange.start}&end=${dateRange.end}`;
      const r = await fetch(url);
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch { /**/ }
        throw new Error(body || `HTTP ${r.status}`);
      }
      return r.json() as Promise<MemberProfileData>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  function handleRangeChange(start: number, end: number) {
    setDateRange({ start, end });
  }

  // Back link preserves date range — defined before early returns so ErrorState can use it
  function goBack() {
    router.push(`/team?start=${dateRange.start}&end=${dateRange.end}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <ProfileSkeleton />;
  if (error || !data) {
    return (
      <ErrorState
        message={String(error ?? "No data returned")}
        onRetry={() => refetch()}
        onBack={goBack}
      />
    );
  }

  const { member, metrics, activity, workload, activityHeatmap, spaceBreakdown, velocityByWeek, priorityBreakdown } = data;
  const displayName = member.username ?? member.email.split("@")[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Layer 1: Page header ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-cu-border bg-cu-panel px-6 py-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[12px] text-cu-text-secondary hover:bg-cu-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to team
          </button>
          <span className="text-cu-border">|</span>
          <h1 className="text-[14px] font-bold text-cu-text">Member Profile</h1>
        </div>
        <DateRangePicker
          start={dateRange.start}
          end={dateRange.end}
          onChange={handleRangeChange}
        />
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Layer 1: Identity + score ring + metric tiles ─────────────── */}
        <div className="border-b border-cu-border bg-cu-sidebar px-6 py-6">
          <div className="flex flex-wrap items-center gap-6">
            {/* Avatar + name + email */}
            <div className="flex items-center gap-4">
              <Avatar member={member} size={64} />
              <div>
                <p className="text-[18px] font-bold text-cu-text leading-tight">{displayName}</p>
                <p className="text-[12px] text-cu-text-secondary">{member.email}</p>
              </div>
            </div>

            {/* Score ring */}
            <div className="ml-auto sm:ml-6">
              <ScoreRing score={metrics.score} />
            </div>
          </div>

          {/* Period label */}
          <p className="mt-3 text-[11px] text-cu-text-tertiary">
            Period:{" "}
            <span className="font-medium text-cu-text-secondary">
              {format(new Date(dateRange.start), "MMM d, yyyy")}
            </span>
            {" → "}
            <span className="font-medium text-cu-text-secondary">
              {format(new Date(dateRange.end), "MMM d, yyyy")}
            </span>
          </p>

          {/* 6 metric tiles */}
          <div className="mt-4 flex flex-wrap gap-3">
            <MetricTile
              label="Score"
              value={metrics.score ?? "—"}
              icon={TrendingUp}
              color={scoreColor(metrics.score)}
              highlight
            />
            <MetricTile
              label="Completion Rate"
              value={`${Math.round(metrics.completionRate)}%`}
              icon={CheckCircle2}
              color="var(--cu-status-done)"
            />
            <MetricTile
              label="On-Time Rate"
              value={`${Math.round(metrics.onTimeRate)}%`}
              icon={Timer}
              color="var(--cu-status-active)"
            />
            <MetricTile
              label="Total Assigned"
              value={metrics.totalAssigned}
              icon={ListTodo}
            />
            <MetricTile
              label="Overdue"
              value={metrics.overdue}
              icon={AlertTriangle}
              color={metrics.overdue > 0 ? "var(--cu-urgent)" : undefined}
            />
            <MetricTile
              label="Hours Logged"
              value={Math.round(metrics.hoursLogged * 10) / 10}
              icon={Clock}
            />
          </div>
        </div>

        {/* ── Layer 2: Mode toggle + task tabs ──────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">

            {/* Mode toggle */}
            <div className="flex items-center gap-0 border-b border-cu-border px-4 py-3">
              <button
                onClick={() => setMode("activity")}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition-colors mr-2",
                  mode === "activity"
                    ? "border-cu-purple bg-cu-purple-light text-cu-purple"
                    : "border-cu-border bg-cu-bg text-cu-text-secondary hover:bg-cu-hover hover:text-cu-text",
                )}
              >
                Activity in period
              </button>
              <button
                onClick={() => setMode("workload")}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                  mode === "workload"
                    ? "border-cu-purple bg-cu-purple-light text-cu-purple"
                    : "border-cu-border bg-cu-bg text-cu-text-secondary hover:bg-cu-hover hover:text-cu-text",
                )}
              >
                Workload snapshot
              </button>
            </div>

            {/* Tabs */}
            {mode === "activity" ? (
              <ActivityTabs
                activity={activity}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            ) : (
              <WorkloadTabs
                workload={workload}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            )}
          </div>

          {/* ── Layer 3: Deep analytics ──────────────────────────────────── */}
          <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
            <button
              onClick={() => setAnalyticsOpen(o => !o)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 hover:bg-cu-hover"
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cu-text-secondary" />
                <span className="text-[13px] font-semibold text-cu-text">
                  {analyticsOpen ? "Hide" : "Show"} detailed analytics
                </span>
              </div>
              {analyticsOpen ? (
                <ChevronUp className="h-4 w-4 text-cu-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-cu-text-tertiary" />
              )}
            </button>

            {analyticsOpen && (
              <div className="border-t border-cu-border px-4 py-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-cu-text-tertiary" />
                    <span className="text-[12px] font-semibold text-cu-text">Activity — last 30 days</span>
                  </div>
                  <ActivityHeatmap data={activityHeatmap} />
                </div>
                <SpaceBreakdown breakdown={spaceBreakdown} />
                <WeeklyVelocity velocity={velocityByWeek} />
                <PriorityBreakdown breakdown={priorityBreakdown} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
