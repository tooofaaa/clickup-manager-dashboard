"use client";

import {
  useState,
  useEffect,
  useMemo,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ListTodo,
  Timer,
  TrendingUp,
  BarChart3,
  CalendarDays,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CUTask } from "@/lib/clickup-client";

// ---------------------------------------------------------------------------
// API response types
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
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  overdueCount: number;
  inProgressCount: number;
  totalTimeMs: number;
  totalTimeHours: number;
  avgTimePerTaskMs: number;
  tasksWithTime: number;
  onTimeCompletions: number;
  onTimeRate: number;
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

interface MemberProfileData {
  member: MemberInfo;
  tasks: {
    inProgress: CUTask[];
    completed: CUTask[];
    overdue: CUTask[];
    upcoming: CUTask[];
  };
  metrics: MemberMetrics;
  activityHeatmap: Record<string, number>;
  spaceBreakdown: SpaceBreakdownEntry[];
  velocityByWeek: VelocityEntry[];
  period: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeScore(metrics: MemberMetrics): number {
  const completionPart = metrics.completionRate * 0.45;
  const onTimePart = metrics.onTimeRate * 0.45;
  const overduePenalty = Math.min(metrics.overdueCount * 2, 10);
  return Math.min(100, Math.max(0, Math.round(completionPart + onTimePart + 10 - overduePenalty)));
}

function scoreColor(score: number): string {
  if (score >= 80) return "#6bc950";
  if (score >= 60) return "#f0a500";
  if (score >= 40) return "#ff8c00";
  return "#f50000";
}

function scoreBg(score: number): string {
  if (score >= 80) return "rgba(107,201,80,0.12)";
  if (score >= 60) return "rgba(240,165,0,0.12)";
  if (score >= 40) return "rgba(255,140,0,0.12)";
  return "rgba(245,0,0,0.10)";
}

function formatDate(ms: string | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(Number(ms));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(task: CUTask): boolean {
  return !!(
    task.due_date &&
    Number(task.due_date) < Date.now() &&
    task.status.type !== "done" &&
    task.status.type !== "closed"
  );
}

function shortWeek(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function priorityLabel(priority: CUTask["priority"]): "urgent" | "high" | "normal" | "low" {
  if (!priority) return "normal";
  const p = priority.priority.toLowerCase();
  if (p === "urgent") return "urgent";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ── Avatar ──────────────────────────────────────────────────────────────────

interface AvatarProps { member: MemberInfo; size?: number }

function Avatar({ member, size = 64 }: AvatarProps) {
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

// ── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  const bg = scoreBg(score);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
        <svg width="72" height="72" className="-rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="28" fill={bg} stroke="var(--cu-border)" strokeWidth="2" />
          <circle
            cx="36" cy="36" r="28"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute text-[18px] font-bold"
          style={{ color }}
        >
          {score}
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-cu-text-tertiary">
        Score
      </span>
    </div>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────────────

interface MetricTileProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  highlight?: boolean;
}

function MetricTile({ label, value, icon: Icon, color, highlight }: MetricTileProps) {
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

// ── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ task }: { task: CUTask }) {
  const color = task.status.color ?? "var(--cu-text-tertiary)";
  return (
    <span
      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
      title={task.status.status}
    />
  );
}

// ── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: CUTask }) {
  const overdue = isOverdue(task);
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
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-cu-text-tertiary">
          <span className="truncate max-w-[120px]">{task.list.name}</span>
          {task.due_date && (
            <>
              <span className="text-cu-border">·</span>
              <span className={overdue ? "text-cu-urgent font-medium" : ""}>
                {overdue ? "Overdue · " : ""}{formatDate(task.due_date)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Task panel ───────────────────────────────────────────────────────────────

type TaskTab = "inProgress" | "completed" | "overdue";

function TaskPanels({ tasks }: { tasks: MemberProfileData["tasks"] }) {
  const [activeTab, setActiveTab] = useState<TaskTab>("inProgress");
  const [expanded, setExpanded] = useState(true);

  const tabs: { id: TaskTab; label: string; count: number; dot?: string }[] = [
    { id: "inProgress", label: "In Progress", count: tasks.inProgress.length, dot: "var(--cu-status-active)" },
    { id: "completed",  label: "Completed",   count: tasks.completed.length,  dot: "var(--cu-status-done)"   },
    { id: "overdue",    label: "Overdue",     count: tasks.overdue.length,    dot: "var(--cu-urgent)"        },
  ];

  const list = tasks[activeTab];

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
      {/* Panel header */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="flex w-full items-center justify-between gap-2 border-b border-cu-border px-4 py-2.5 hover:bg-cu-hover"
      >
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-cu-text-secondary" />
          <span className="text-[13px] font-semibold text-cu-text">Tasks</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-cu-text-tertiary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-cu-text-tertiary" />
        )}
      </button>

      {expanded && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-cu-border px-4">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors",
                  activeTab === t.id
                    ? "border-cu-purple text-cu-purple"
                    : "border-transparent text-cu-text-secondary hover:text-cu-text",
                )}
              >
                {t.dot && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: t.dot }}
                  />
                )}
                {t.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  activeTab === t.id
                    ? "bg-cu-purple-light text-cu-purple"
                    : "bg-cu-hover text-cu-text-tertiary",
                )}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Task list */}
          <div className="max-h-[340px] overflow-y-auto px-2 py-2">
            {list.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-[12px] text-cu-text-tertiary">
                No {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} tasks
              </div>
            ) : (
              list.map(task => <TaskRow key={task.id} task={task} />)
            )}
          </div>

          {/* Upcoming section */}
          {tasks.upcoming.length > 0 && (
            <>
              <div className="border-t border-cu-border px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-cu-text-tertiary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-cu-text-tertiary">
                    Upcoming — next 14 days
                  </span>
                  <span className="rounded-full bg-cu-hover px-1.5 py-0.5 text-[10px] font-semibold text-cu-text-tertiary">
                    {tasks.upcoming.length}
                  </span>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto px-2 pb-2">
                {tasks.upcoming.map(task => <TaskRow key={task.id} task={task} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Activity heatmap ─────────────────────────────────────────────────────────

function ActivityHeatmap({ heatmap }: { heatmap: Record<string, number> }) {
  const days = useMemo(() => {
    const arr: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      arr.push({ date: key, count: heatmap[key] ?? 0 });
    }
    return arr;
  }, [heatmap]);

  const maxCount = Math.max(1, ...days.map(d => d.count));

  function cellColor(count: number): string {
    if (count === 0) return "var(--cu-hover)";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "rgba(107,201,80,0.3)";
    if (intensity < 0.5)  return "rgba(107,201,80,0.55)";
    if (intensity < 0.75) return "rgba(107,201,80,0.75)";
    return "#6bc950";
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Activity — last 30 days</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {days.map(({ date, count }) => (
          <div
            key={date}
            title={`${date}: ${count} update${count !== 1 ? "s" : ""}`}
            className="h-4 w-4 rounded-sm"
            style={{ background: cellColor(count) }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-cu-text-tertiary">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(level => (
          <div
            key={level}
            className="h-3 w-3 rounded-sm"
            style={{ background: level === 0 ? "var(--cu-hover)" : `rgba(107,201,80,${level === 1 ? 1 : level * 0.75 + 0.3})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ── Space breakdown ───────────────────────────────────────────────────────────

function SpaceBreakdown({ breakdown }: { breakdown: SpaceBreakdownEntry[] }) {
  if (breakdown.length === 0) {
    return (
      <div className="text-[12px] text-cu-text-tertiary">No space data</div>
    );
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
                className="h-full rounded-full transition-all duration-300"
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

// ── Weekly velocity ───────────────────────────────────────────────────────────

function WeeklyVelocity({ velocity }: { velocity: VelocityEntry[] }) {
  const maxVal = Math.max(1, ...velocity.map(v => v.completed));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Weekly velocity</span>
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {velocity.map((week, i) => {
          const heightPct = maxVal > 0 ? (week.completed / maxVal) * 100 : 0;
          return (
            <div
              key={week.weekStart}
              className="flex flex-1 flex-col items-center gap-1 group"
            >
              <span className="text-[9px] font-semibold text-cu-text opacity-0 group-hover:opacity-100 transition-opacity">
                {week.completed}
              </span>
              <div
                title={`${shortWeek(week.weekStart)}: ${week.completed} completed`}
                className="w-full rounded-t-sm transition-all duration-200 hover:opacity-80"
                style={{
                  height: `${Math.max(2, Math.round(heightPct * 0.75))}px`,
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

// ── Priority breakdown ────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--cu-urgent)",
  high:   "var(--cu-high)",
  normal: "var(--cu-normal)",
  low:    "var(--cu-low)",
};

const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;

function PriorityBreakdown({ tasks }: { tasks: MemberProfileData["tasks"] }) {
  const allTasks = [
    ...tasks.inProgress,
    ...tasks.completed,
    ...tasks.overdue,
  ];

  const counts = useMemo(() => {
    const acc: Record<string, number> = { urgent: 0, high: 0, normal: 0, low: 0 };
    for (const t of allTasks) {
      acc[priorityLabel(t.priority)]++;
    }
    return acc;
  }, [allTasks.length]);

  const total = allTasks.length || 1;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Circle className="h-3.5 w-3.5 text-cu-text-tertiary" />
        <span className="text-[12px] font-semibold text-cu-text">Priority breakdown</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {PRIORITY_ORDER.map(p => {
          const pct = Math.round((counts[p] / total) * 100);
          if (pct === 0) return null;
          return (
            <div
              key={p}
              title={`${p}: ${counts[p]}`}
              style={{ width: `${pct}%`, background: PRIORITY_COLORS[p] }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {PRIORITY_ORDER.map(p => (
          <div key={p} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: PRIORITY_COLORS[p] }}
            />
            <span className="text-[11px] text-cu-text-secondary capitalize">{p}</span>
            <span className="text-[11px] font-semibold text-cu-text">{counts[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deep analytics panel ──────────────────────────────────────────────────────

function DeepAnalytics({ data }: { data: MemberProfileData }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 hover:bg-cu-hover"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cu-text-secondary" />
          <span className="text-[13px] font-semibold text-cu-text">Detailed analytics</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-cu-text-tertiary">
          {open ? "Hide" : "Show"}
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-cu-border px-4 py-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ActivityHeatmap heatmap={data.activityHeatmap} />
          <SpaceBreakdown breakdown={data.spaceBreakdown} />
          <WeeklyVelocity velocity={data.velocityByWeek} />
          <PriorityBreakdown tasks={data.tasks} />
        </div>
      )}
    </div>
  );
}

// ── Date range picker ─────────────────────────────────────────────────────────

interface DateRangePickerProps {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

function DateRangePicker({ start, end, onChange }: DateRangePickerProps) {
  function toInputDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function fromInputDate(s: string, fallback: number): number {
    const n = Date.parse(s);
    return isNaN(n) ? fallback : n;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-cu-text-tertiary">Period</span>
      <input
        type="date"
        value={toInputDate(start)}
        onChange={e => onChange(fromInputDate(e.target.value, start), end)}
        className="rounded-lg border border-cu-border bg-cu-bg px-2 py-1 text-[12px] text-cu-text focus:border-cu-purple focus:outline-none"
      />
      <span className="text-[11px] text-cu-text-tertiary">to</span>
      <input
        type="date"
        value={toInputDate(end)}
        onChange={e => onChange(start, fromInputDate(e.target.value, end))}
        className="rounded-lg border border-cu-border bg-cu-bg px-2 py-1 text-[12px] text-cu-text focus:border-cu-purple focus:outline-none"
      />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header strip */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div className="h-4 w-24 animate-pulse rounded bg-cu-hover" />
      </div>
      {/* Avatar + metrics area */}
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
      {/* Content area */}
      <div className="flex-1 px-6 py-4 space-y-4">
        <div className="h-64 animate-pulse rounded-xl bg-cu-hover" />
        <div className="h-40 animate-pulse rounded-xl bg-cu-hover" />
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-cu-urgent" />
      <div>
        <p className="text-[14px] font-semibold text-cu-text">Failed to load member profile</p>
        <p className="mt-1 text-[12px] text-cu-text-tertiary">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-cu-border px-4 py-1.5 text-[12px] text-cu-text-secondary hover:bg-cu-hover"
      >
        Retry
      </button>
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

  // Derive start/end from URL params; default to current month
  const defaultStart = startOfMonth();
  const defaultEnd   = Date.now();

  const [rangeStart, setRangeStart] = useState<number>(() => {
    const raw = searchParams.get("start");
    if (raw) { const n = Number(raw); if (!isNaN(n)) return n; }
    return defaultStart;
  });

  const [rangeEnd, setRangeEnd] = useState<number>(() => {
    const raw = searchParams.get("end");
    if (raw) { const n = Number(raw); if (!isNaN(n)) return n; }
    return defaultEnd;
  });

  // Sync URL whenever the date range changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("start", String(rangeStart));
    url.searchParams.set("end", String(rangeEnd));
    router.replace(url.pathname + url.search, { scroll: false });
  }, [rangeStart, rangeEnd, router]);

  const { data, isLoading, error, refetch } = useQuery<MemberProfileData>({
    queryKey: ["cu-member-profile", memberId, rangeStart, rangeEnd],
    queryFn: async () => {
      const url = `/api/clickup/member/${memberId}?start=${rangeStart}&end=${rangeEnd}`;
      const r = await fetch(url);
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch {/* */}
        throw new Error(body || `HTTP ${r.status}`);
      }
      return r.json() as Promise<MemberProfileData>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  function handleRangeChange(start: number, end: number) {
    setRangeStart(start);
    setRangeEnd(end);
  }

  if (isLoading) return <ProfileSkeleton />;
  if (error || !data) {
    return (
      <ErrorState
        message={String(error ?? "No data returned")}
        onRetry={() => refetch()}
      />
    );
  }

  const { member, metrics, tasks } = data;
  const score = computeScore(metrics);
  const displayName = member.username ?? member.email.split("@")[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/team")}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[12px] text-cu-text-secondary hover:bg-cu-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to team
          </button>
          <span className="text-cu-border">|</span>
          <h1 className="text-[14px] font-bold text-cu-text">Employee Profile</h1>
        </div>
        <DateRangePicker
          start={rangeStart}
          end={rangeEnd}
          onChange={handleRangeChange}
        />
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Layer 1: Identity + score + metric tiles ─────────────────────── */}
        <div className="border-b border-cu-border bg-cu-sidebar px-6 py-6">
          <div className="flex flex-wrap items-center gap-6">
            {/* Avatar + name */}
            <div className="flex items-center gap-4">
              <Avatar member={member} size={64} />
              <div>
                <p className="text-[18px] font-bold text-cu-text leading-tight">{displayName}</p>
                <p className="text-[12px] text-cu-text-secondary">{member.email}</p>
                <p className="mt-0.5 text-[11px] text-cu-text-tertiary">
                  Member ID: {member.id}
                </p>
              </div>
            </div>

            {/* Score badge */}
            <div className="ml-auto sm:ml-6">
              <ScoreBadge score={score} />
            </div>
          </div>

          {/* 6 metric tiles */}
          <div className="mt-5 flex flex-wrap gap-3">
            <MetricTile
              label="Performance Score"
              value={score}
              icon={TrendingUp}
              color={scoreColor(score)}
              highlight
            />
            <MetricTile
              label="Completion Rate"
              value={`${metrics.completionRate}%`}
              icon={CheckCircle2}
              color="var(--cu-status-done)"
            />
            <MetricTile
              label="On-Time Rate"
              value={`${metrics.onTimeRate}%`}
              icon={Timer}
              color="var(--cu-status-active)"
            />
            <MetricTile
              label="Tasks Done"
              value={metrics.completedTasks}
              icon={CheckCircle2}
            />
            <MetricTile
              label="Overdue"
              value={metrics.overdueCount}
              icon={AlertTriangle}
              color={metrics.overdueCount > 0 ? "var(--cu-urgent)" : undefined}
            />
            <MetricTile
              label="Hours Logged"
              value={metrics.totalTimeHours}
              icon={Clock}
            />
          </div>
        </div>

        {/* ── Layers 2 + 3 ─────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">

          {/* Layer 2: Task panels */}
          <TaskPanels tasks={tasks} />

          {/* Layer 3: Deep analytics */}
          <DeepAnalytics data={data} />

        </div>
      </div>
    </div>
  );
}
