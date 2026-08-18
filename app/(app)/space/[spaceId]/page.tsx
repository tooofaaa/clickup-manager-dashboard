"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  Calendar,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CUTask } from "@/lib/clickup-client";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface SpaceStatus {
  id: string;
  status: string;
  type: string;
  color: string;
  orderindex: number;
}

interface SpaceInfo {
  id: string;
  name: string;
  color: string | null;
  statuses: SpaceStatus[];
}

interface FolderListItem {
  id: string;
  name: string;
  taskCount: number;
}

interface FolderItem {
  id: string;
  name: string;
  lists: FolderListItem[];
}

interface ByListEntry {
  listId: string;
  listName: string;
  folderId: string | null;
  folderName: string | null;
  tasks: CUTask[];
}

interface ByAssigneeEntry {
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeColor: string | null;
  assigneeInitials: string;
  assigneeAvatar: string | null;
  tasks: CUTask[];
}

interface SpaceStats {
  totalTasks: number;
  openTasks: number;
  inProgressTasks: number;
  closedTasks: number;
  overdueTasks: number;
  tasksWithDueDates: number;
  uniqueAssignees: number;
}

interface SpaceDetailResponse {
  space: SpaceInfo;
  folders: FolderItem[];
  folderlessLists: FolderListItem[];
  tasks: CUTask[];
  byList: ByListEntry[];
  byAssignee: ByAssigneeEntry[];
  unassignedTasks: CUTask[];
  stats: SpaceStats;
}

// ---------------------------------------------------------------------------
// View / tab types
// ---------------------------------------------------------------------------

type MainView = "period" | "cumulative";
type PeriodTab = "opened" | "completed" | "overdue" | "inprogress";
type CumulativeTab = "stillopen" | "overdue" | "completed" | "all";
type PeriodPreset = "thismonth" | "lastmonth" | "last3months" | "custom";
type CumulativePreset = "today" | "endlastmonth" | "6monthsago" | "custom";

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

function filterTaskForPeriod(
  task: CUTask,
  startMs: number,
  endMs: number,
  tab: PeriodTab
): boolean {
  switch (tab) {
    case "opened":
      return (
        Number(task.date_created) >= startMs &&
        Number(task.date_created) <= endMs
      );
    case "completed":
      return !!(
        task.date_closed &&
        Number(task.date_closed) >= startMs &&
        Number(task.date_closed) <= endMs
      );
    case "overdue":
      return !!(
        task.due_date &&
        Number(task.due_date) >= startMs &&
        Number(task.due_date) <= endMs &&
        task.status.type !== "closed"
      );
    case "inprogress":
      return (
        Number(task.date_updated) >= startMs &&
        Number(task.date_updated) <= endMs &&
        task.status.type !== "closed"
      );
  }
}

function filterTaskForCumulative(
  task: CUTask,
  cutoffMs: number,
  tab: CumulativeTab
): boolean {
  switch (tab) {
    case "stillopen":
      return (
        Number(task.date_created) <= cutoffMs &&
        (task.status.type !== "closed" ||
          (!!task.date_closed && Number(task.date_closed) > cutoffMs))
      );
    case "overdue":
      return !!(
        task.due_date &&
        Number(task.due_date) < cutoffMs &&
        (task.status.type !== "closed" ||
          (!!task.date_closed && Number(task.date_closed) > cutoffMs))
      );
    case "completed":
      return !!(task.date_closed && Number(task.date_closed) <= cutoffMs);
    case "all":
      return Number(task.date_created) <= cutoffMs;
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function msForDate(dateStr: string): number {
  // parse date string as start of local day
  return new Date(dateStr + "T00:00:00").getTime();
}

function msForDateEndOfDay(dateStr: string): number {
  return new Date(dateStr + "T23:59:59").getTime();
}

function daysLate(dueDateMs: number, referenceMs: number): number {
  return Math.floor((referenceMs - dueDateMs) / 86_400_000);
}

// ---------------------------------------------------------------------------
// AssigneeAvatar
// ---------------------------------------------------------------------------

interface AvatarUser {
  username?: string | null;
  email: string;
  color?: string | null;
  profilePicture?: string | null;
  initials: string;
}

function AssigneeAvatar({ user, size = 20 }: { user: AvatarUser; size?: number }) {
  const bg = user.color ?? "var(--cu-purple)";
  const style = {
    width: size,
    height: size,
    minWidth: size,
    fontSize: Math.floor(size * 0.38),
    backgroundColor: bg,
  };

  if (user.profilePicture) {
    return (
      <img
        src={user.profilePicture}
        alt={user.username ?? user.email}
        className="shrink-0 rounded-full object-cover"
        style={style}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white uppercase"
      style={style}
      title={user.username ?? user.email}
    >
      {user.initials || "?"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ task }: { task: CUTask }) {
  return (
    <span
      className="inline-flex max-w-[90px] truncate items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        color: task.status.color || "var(--cu-text-secondary)",
        backgroundColor: `${task.status.color}22`,
        border: `1px solid ${task.status.color}44`,
      }}
      title={task.status.status}
    >
      {task.status.status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TaskRow (period & cumulative)
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: CUTask;
  highlightOverdue?: boolean;
  highlightCompleted?: boolean;
  showCompletedDate?: boolean;
  referenceMs?: number; // for "days late" calculation
}

function TaskRow({
  task,
  highlightOverdue,
  highlightCompleted,
  showCompletedDate,
  referenceMs,
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleAssignees = task.assignees.slice(0, 3);
  const overflowAssignees = task.assignees.length - 3;

  const refMs = referenceMs ?? Date.now();
  const dueMs = task.due_date ? Number(task.due_date) : null;
  const late = dueMs !== null && highlightOverdue ? daysLate(dueMs, refMs) : null;
  const closedMs = task.date_closed ? Number(task.date_closed) : null;

  return (
    <div
      className={cn(
        "group border-b border-cu-border/50 last:border-b-0 transition-colors",
        highlightOverdue && "bg-red-50/30 hover:bg-red-50/50",
        highlightCompleted && !highlightOverdue && "bg-green-50/20 hover:bg-green-50/40",
        !highlightOverdue && !highlightCompleted && "hover:bg-cu-hover"
      )}
    >
      {/* Main row */}
      <div
        className="flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand chevron */}
        <span className="shrink-0 text-cu-text-tertiary">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3 opacity-40 group-hover:opacity-100" />
          )}
        </span>

        {/* Status dot */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: task.status.color || "var(--cu-text-tertiary)" }}
          title={task.status.status}
        />

        {/* Task name */}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-cu-text">
          {task.name}
        </span>

        {/* Assignee avatars */}
        {task.assignees.length > 0 && (
          <div className="hidden shrink-0 items-center -space-x-1 sm:flex">
            {visibleAssignees.map((a) => (
              <AssigneeAvatar
                key={a.id}
                user={{
                  username: a.username,
                  email: a.email,
                  color: a.color,
                  profilePicture: a.profilePicture,
                  initials: a.initials,
                }}
                size={18}
              />
            ))}
            {overflowAssignees > 0 && (
              <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-cu-hover px-0.5 text-[9px] font-semibold text-cu-text-secondary">
                +{overflowAssignees}
              </span>
            )}
          </div>
        )}

        {/* Status badge */}
        <div className="hidden shrink-0 sm:block">
          <StatusBadge task={task} />
        </div>

        {/* Due date */}
        {dueMs && (
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium tabular-nums",
              highlightOverdue ? "text-red-500 font-bold" : "text-cu-text-tertiary"
            )}
          >
            {format(new Date(dueMs), "MMM d")}
          </span>
        )}

        {/* Days late badge */}
        {late !== null && late > 0 && (
          <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {late}d late
          </span>
        )}

        {/* Completion date */}
        {showCompletedDate && closedMs && (
          <span className="shrink-0 text-[11px] font-medium text-emerald-600 tabular-nums">
            ✓ {format(new Date(closedMs), "MMM d")}
          </span>
        )}

        {/* Open in ClickUp */}
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-cu-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-cu-purple"
          title="Open in ClickUp"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-cu-border/50 bg-cu-hover/50 px-9 py-3 space-y-2">
          {/* All assignees */}
          {task.assignees.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-cu-text-tertiary w-20 shrink-0">
                Assignees
              </span>
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-1 rounded-full bg-cu-panel border border-cu-border px-1.5 py-0.5">
                    <AssigneeAvatar
                      user={{
                        username: a.username,
                        email: a.email,
                        color: a.color,
                        profilePicture: a.profilePicture,
                        initials: a.initials,
                      }}
                      size={14}
                    />
                    <span className="text-[11px] text-cu-text-secondary">
                      {a.username ?? a.email}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-cu-text-tertiary">Created</span>
              <span className="text-[11px] text-cu-text-secondary">
                {format(new Date(Number(task.date_created)), "MMM d, yyyy")}
              </span>
            </div>
            {dueMs && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-cu-text-tertiary">Due</span>
                <span className={cn("text-[11px]", highlightOverdue ? "font-bold text-red-500" : "text-cu-text-secondary")}>
                  {format(new Date(dueMs), "MMM d, yyyy")}
                </span>
              </div>
            )}
            {closedMs && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-cu-text-tertiary">Completed</span>
                <span className="text-[11px] text-emerald-600 font-medium">
                  {format(new Date(closedMs), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>

          {/* List location */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-cu-text-tertiary w-20 shrink-0">List</span>
            <span className="text-[11px] text-cu-text-secondary">
              {task.folder.hidden ? "" : `${task.folder.name} / `}{task.list.name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskList
// ---------------------------------------------------------------------------

interface TaskListProps {
  tasks: CUTask[];
  tab: PeriodTab | CumulativeTab;
  periodEndMs?: number; // for overdue "days late" in period view
  cutoffMs?: number;    // for overdue "days late" in cumulative view
  searchTerm: string;
  statusFilter: string;
}

function TaskList({ tasks, tab, periodEndMs, cutoffMs, searchTerm, statusFilter }: TaskListProps) {
  const filtered = useMemo(() => {
    let result = tasks;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(lower));
    }
    if (statusFilter && statusFilter !== "__all__") {
      result = result.filter((t) => t.status.status === statusFilter);
    }
    return result;
  }, [tasks, searchTerm, statusFilter]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-[13px] font-medium text-cu-text-secondary">No tasks match the current filters</p>
        {(searchTerm || statusFilter !== "__all__") && (
          <p className="text-[12px] text-cu-text-tertiary">Try clearing the search or status filter</p>
        )}
      </div>
    );
  }

  const isOverdueTab = tab === "overdue";
  const isCompletedTab = tab === "completed";
  const refMs = periodEndMs ?? cutoffMs ?? Date.now();

  return (
    <div className="divide-y-0">
      {filtered.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          highlightOverdue={isOverdueTab}
          highlightCompleted={isCompletedTab}
          showCompletedDate={isCompletedTab}
          referenceMs={refMs}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responsible Persons strip
// ---------------------------------------------------------------------------

interface ResponsiblePerson {
  id: number;
  name: string;
  email: string;
  color: string | null;
  avatar: string | null;
  initials: string;
  count: number;
}

interface ResponsibleStripProps {
  tasks: CUTask[];
  assigneeFilter: number | null;
  onToggle: (id: number) => void;
  onClear: () => void;
}

function ResponsibleStrip({ tasks, assigneeFilter, onToggle, onClear }: ResponsibleStripProps) {
  const persons = useMemo<ResponsiblePerson[]>(() => {
    const map = new Map<number, ResponsiblePerson>();
    for (const task of tasks) {
      for (const a of task.assignees) {
        const ex = map.get(a.id);
        if (ex) {
          ex.count++;
        } else {
          map.set(a.id, {
            id: a.id,
            name: a.username ?? a.email,
            email: a.email,
            color: a.color ?? null,
            avatar: a.profilePicture ?? null,
            initials: a.initials,
            count: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [tasks]);

  if (persons.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-2.5 border-b border-cu-border bg-cu-panel/60">
      <span className="shrink-0 text-[11px] font-semibold text-cu-text-tertiary mr-1">
        Responsible:
      </span>
      {persons.slice(0, 14).map((p) => (
        <button
          key={p.id}
          onClick={() => onToggle(p.id)}
          title={p.email}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
            assigneeFilter === p.id
              ? "border-cu-purple bg-cu-purple-light text-cu-purple"
              : "border-cu-border bg-cu-panel text-cu-text-secondary hover:border-cu-purple/50 hover:text-cu-text"
          )}
        >
          <AssigneeAvatar
            user={{
              username: p.name,
              email: p.email,
              color: p.color,
              profilePicture: p.avatar,
              initials: p.initials,
            }}
            size={16}
          />
          <span className="max-w-[72px] truncate">{p.name}</span>
          <span className="rounded-full bg-cu-hover px-1 text-[10px] font-semibold text-cu-text-tertiary">
            {p.count}
          </span>
        </button>
      ))}
      {persons.length > 14 && (
        <span className="text-[11px] text-cu-text-tertiary">+{persons.length - 14} more</span>
      )}
      {assigneeFilter !== null && (
        <button
          onClick={onClear}
          className="rounded-full border border-cu-border px-2 py-0.5 text-[11px] text-cu-text-tertiary transition-colors hover:border-red-300 hover:text-red-500"
        >
          Clear ×
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  count: number;
  color: string;
}

function TabNav({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-end gap-0 px-6 border-b border-cu-border bg-cu-panel">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={cn(
            "relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
            active === tab.id
              ? "text-cu-text"
              : "text-cu-text-tertiary hover:text-cu-text-secondary"
          )}
        >
          {tab.label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              active === tab.id ? "text-white" : "text-cu-text-tertiary bg-cu-hover"
            )}
            style={active === tab.id ? { backgroundColor: tab.color } : undefined}
          >
            {tab.count}
          </span>
          {active === tab.id && (
            <span
              className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full"
              style={{ backgroundColor: tab.color }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat strip
// ---------------------------------------------------------------------------

interface StripStatProps {
  label: string;
  value: number;
  color?: string;
  warn?: boolean;
}

function StripStat({ label, value, color, warn }: StripStatProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border px-5 py-3 min-w-[90px]",
        warn && value > 0
          ? "border-red-200 bg-red-50"
          : "border-cu-border bg-cu-panel"
      )}
    >
      <span
        className="text-[22px] font-bold tabular-nums leading-none"
        style={{ color: warn && value > 0 ? "#ef4444" : color ?? "var(--cu-text)" }}
      >
        {value}
      </span>
      <span className="mt-1 text-[11px] font-medium text-cu-text-tertiary">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SpaceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const spaceId = params.spaceId as string;

  // ── Data fetch ────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, refetch, dataUpdatedAt, error } =
    useQuery<SpaceDetailResponse>({
      queryKey: ["space", spaceId],
      queryFn: async () => {
        const r = await fetch(`/api/clickup/space/${spaceId}`);
        if (!r.ok) {
          let body = "";
          try { body = await r.text(); } catch { /* */ }
          throw new Error(body || `HTTP ${r.status}`);
        }
        return r.json() as Promise<SpaceDetailResponse>;
      },
      staleTime: 5 * 60 * 1000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: 1,
    });

  const hasError = !!error;
  const errMessage = hasError ? String(error).replace(/^Error:\s*/, "") : null;
  const space = data?.space;
  const stats = data?.stats;

  // ── Live sync countdown ───────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(30);
  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? 30 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  // Reset countdown when data refreshes
  useEffect(() => { setCountdown(30); }, [dataUpdatedAt]);

  // ── Main view toggle ──────────────────────────────────────────────────────
  const [mainView, setMainView] = useState<MainView>("period");

  // ── Period view state ─────────────────────────────────────────────────────
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("thismonth");
  const [customPeriodStart, setCustomPeriodStart] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [customPeriodEnd, setCustomPeriodEnd] = useState(todayStr());
  const [periodTab, setPeriodTab] = useState<PeriodTab>("opened");

  // ── Cumulative view state ─────────────────────────────────────────────────
  const [cumulativePreset, setCumulativePreset] = useState<CumulativePreset>("today");
  const [customCutoffDate, setCustomCutoffDate] = useState(todayStr());
  const [cumulativeTab, setCumulativeTab] = useState<CumulativeTab>("stillopen");

  // ── Shared filter state ───────────────────────────────────────────────────
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // ── Compute period range ──────────────────────────────────────────────────
  const { periodStartMs, periodEndMs } = useMemo(() => {
    const today = new Date();
    switch (periodPreset) {
      case "thismonth":
        return {
          periodStartMs: startOfMonth(today).getTime(),
          periodEndMs: today.getTime(),
        };
      case "lastmonth": {
        const lm = subMonths(today, 1);
        return {
          periodStartMs: startOfMonth(lm).getTime(),
          periodEndMs: endOfMonth(lm).getTime(),
        };
      }
      case "last3months":
        return {
          periodStartMs: subMonths(today, 3).getTime(),
          periodEndMs: today.getTime(),
        };
      case "custom":
      default:
        return {
          periodStartMs: msForDate(customPeriodStart),
          periodEndMs: msForDateEndOfDay(customPeriodEnd),
        };
    }
  }, [periodPreset, customPeriodStart, customPeriodEnd]);

  // ── Compute cutoff ────────────────────────────────────────────────────────
  const cutoffMs = useMemo(() => {
    const today = new Date();
    switch (cumulativePreset) {
      case "today":
        return today.getTime();
      case "endlastmonth":
        return endOfMonth(subMonths(today, 1)).getTime();
      case "6monthsago":
        return subMonths(today, 6).getTime();
      case "custom":
      default:
        return msForDateEndOfDay(customCutoffDate);
    }
  }, [cumulativePreset, customCutoffDate]);

  // ── Filtered task buckets ─────────────────────────────────────────────────
  const allTasks = data?.tasks ?? [];

  const applyAssigneeFilter = (tasks: CUTask[]) =>
    assigneeFilter === null
      ? tasks
      : tasks.filter((t) => t.assignees.some((a) => a.id === assigneeFilter));

  const periodBuckets = useMemo(() => {
    const base = applyAssigneeFilter(allTasks);
    return {
      opened: base.filter((t) => filterTaskForPeriod(t, periodStartMs, periodEndMs, "opened")),
      completed: base.filter((t) => filterTaskForPeriod(t, periodStartMs, periodEndMs, "completed")),
      overdue: base.filter((t) => filterTaskForPeriod(t, periodStartMs, periodEndMs, "overdue")),
      inprogress: base.filter((t) => filterTaskForPeriod(t, periodStartMs, periodEndMs, "inprogress")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, periodStartMs, periodEndMs, assigneeFilter]);

  const cumulativeBuckets = useMemo(() => {
    const base = applyAssigneeFilter(allTasks);
    return {
      stillopen: base.filter((t) => filterTaskForCumulative(t, cutoffMs, "stillopen")),
      overdue: base.filter((t) => filterTaskForCumulative(t, cutoffMs, "overdue")),
      completed: base.filter((t) => filterTaskForCumulative(t, cutoffMs, "completed")),
      all: base.filter((t) => filterTaskForCumulative(t, cutoffMs, "all")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, cutoffMs, assigneeFilter]);

  // ── Tasks for current tab (used in responsible strip + task list) ─────────
  const currentTabTasks = useMemo(() => {
    if (mainView === "period") return periodBuckets[periodTab];
    return cumulativeBuckets[cumulativeTab];
  }, [mainView, periodTab, cumulativeTab, periodBuckets, cumulativeBuckets]);

  // ── Unique statuses for filter dropdown ───────────────────────────────────
  const availableStatuses = useMemo(() => {
    const seen = new Set<string>();
    for (const t of currentTabTasks) {
      seen.add(t.status.status);
    }
    return Array.from(seen).sort();
  }, [currentTabTasks]);

  // ── Summary label ─────────────────────────────────────────────────────────
  const summaryLabel = useMemo(() => {
    let base = currentTabTasks.length;
    if (searchTerm || statusFilter !== "__all__") {
      let f = currentTabTasks;
      if (searchTerm) f = f.filter((t) => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
      if (statusFilter !== "__all__") f = f.filter((t) => t.status.status === statusFilter);
      base = f.length;
    }
    if (mainView === "period") {
      const s = format(new Date(periodStartMs), "MMM d");
      const e = format(new Date(periodEndMs), "MMM d, yyyy");
      return `Showing ${base} tasks · Period: ${s} – ${e}`;
    } else {
      const d = format(new Date(cutoffMs), "MMM d, yyyy");
      return `Showing ${base} tasks · Up to: ${d}`;
    }
  }, [currentTabTasks, searchTerm, statusFilter, mainView, periodStartMs, periodEndMs, cutoffMs]);

  // ── Period tab defs ───────────────────────────────────────────────────────
  const periodTabDefs: TabDef[] = [
    { id: "opened", label: "Opened", count: periodBuckets.opened.length, color: "#3b82f6" },
    { id: "completed", label: "Completed", count: periodBuckets.completed.length, color: "#10b981" },
    { id: "overdue", label: "Overdue", count: periodBuckets.overdue.length, color: "#ef4444" },
    { id: "inprogress", label: "In Progress", count: periodBuckets.inprogress.length, color: "#f59e0b" },
  ];

  // ── Cumulative tab defs ───────────────────────────────────────────────────
  const cumulativeTabDefs: TabDef[] = [
    { id: "stillopen", label: "Still Open", count: cumulativeBuckets.stillopen.length, color: "#3b82f6" },
    { id: "overdue", label: "Overdue", count: cumulativeBuckets.overdue.length, color: "#ef4444" },
    { id: "completed", label: "Completed", count: cumulativeBuckets.completed.length, color: "#10b981" },
    { id: "all", label: "All Tasks", count: cumulativeBuckets.all.length, color: "#8b5cf6" },
  ];

  const activeTab = mainView === "period" ? periodTab : cumulativeTab;
  const currentTabDefs = mainView === "period" ? periodTabDefs : cumulativeTabDefs;

  const handleTabSelect = (id: string) => {
    setSearchTerm("");
    setStatusFilter("__all__");
    if (mainView === "period") setPeriodTab(id as PeriodTab);
    else setCumulativeTab(id as CumulativeTab);
  };

  const activeTabColor =
    currentTabDefs.find((t) => t.id === activeTab)?.color ?? "var(--cu-purple)";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden bg-cu-bg">

      {/* ════════════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Back */}
          <button
            onClick={() => router.push("/home")}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[12px] font-medium text-cu-text-secondary transition-colors hover:bg-cu-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Projects
          </button>

          {/* Space identity */}
          {space ? (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span
                className="h-5 w-5 shrink-0 rounded-md shadow-sm"
                style={{ backgroundColor: space.color ?? "var(--cu-purple)" }}
              />
              <h1 className="text-[17px] font-bold text-cu-text truncate">{space.name}</h1>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="h-5 w-5 animate-pulse rounded-md bg-cu-hover shrink-0" />
              <div className="h-5 w-40 animate-pulse rounded bg-cu-hover" />
            </div>
          )}

          {/* Right side actions */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* Open in ClickUp */}
            <a
              href={`https://app.clickup.com/space/${spaceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[12px] font-medium text-cu-text-secondary transition-colors hover:bg-cu-hover hover:text-cu-purple"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in ClickUp
            </a>

            {/* Live indicator */}
            {dataUpdatedAt > 0 && (
              <div className="flex items-center gap-1.5 text-[11px]">
                {isFetching ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-green-500" />
                    <span className="font-medium text-green-600">Syncing…</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="font-medium text-green-600 hidden sm:inline">
                      Live · refreshes in {countdown}s
                    </span>
                  </>
                )}
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-cu-text-tertiary transition-colors hover:bg-cu-hover hover:text-cu-text"
                  title="Refresh now"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ERROR BANNER
      ════════════════════════════════════════════════════════════════════ */}
      {hasError && (
        <div className="shrink-0 border-b border-[#fca5a5] bg-[#fef2f2] px-6 py-2.5">
          <p className="text-[13px] font-medium text-[#991b1b]">
            Failed to load space data{errMessage ? ` — ${errMessage}` : ""}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STATS STRIP
      ════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3">
        {isLoading ? (
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[62px] w-[90px] animate-pulse rounded-xl bg-cu-hover" />
            ))}
          </div>
        ) : stats ? (
          <div className="flex flex-wrap gap-3">
            <StripStat label="Total Tasks" value={stats.totalTasks} color="var(--cu-text)" />
            <StripStat label="Open" value={stats.openTasks} color="#3b82f6" />
            <StripStat label="Completed" value={stats.closedTasks} color="#10b981" />
            <StripStat label="Overdue" value={stats.overdueTasks} color="#ef4444" warn />
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN VIEW TOGGLE
      ════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3">
        <div className="inline-flex rounded-lg border border-cu-border bg-cu-hover p-0.5 gap-0.5">
          <button
            onClick={() => setMainView("period")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold transition-colors",
              mainView === "period"
                ? "bg-cu-panel text-cu-text shadow-sm"
                : "text-cu-text-secondary hover:text-cu-text"
            )}
          >
            <Calendar className="h-4 w-4" />
            Activity in Period
          </button>
          <button
            onClick={() => setMainView("cumulative")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold transition-colors",
              mainView === "cumulative"
                ? "bg-cu-panel text-cu-text shadow-sm"
                : "text-cu-text-secondary hover:text-cu-text"
            )}
          >
            <BarChart2 className="h-4 w-4" />
            Status up to Date
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PERIOD / CUMULATIVE CONTROLS
      ════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel/80 px-6 py-3">
        {mainView === "period" ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Preset buttons */}
            {(
              [
                { id: "thismonth", label: "This Month" },
                { id: "lastmonth", label: "Last Month" },
                { id: "last3months", label: "Last 3 Months" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodPreset(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  periodPreset === p.id
                    ? "border-cu-purple bg-cu-purple-light text-cu-purple"
                    : "border-cu-border bg-cu-panel text-cu-text-secondary hover:border-cu-purple/40 hover:text-cu-text"
                )}
              >
                {p.label}
              </button>
            ))}

            {/* Custom date range */}
            {periodPreset === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-[11px] font-medium text-cu-text-tertiary">From</span>
                <input
                  type="date"
                  value={customPeriodStart}
                  onChange={(e) => setCustomPeriodStart(e.target.value)}
                  className="h-7 rounded-lg border border-cu-border bg-cu-panel px-2 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
                />
                <span className="text-[11px] font-medium text-cu-text-tertiary">→</span>
                <input
                  type="date"
                  value={customPeriodEnd}
                  onChange={(e) => setCustomPeriodEnd(e.target.value)}
                  className="h-7 rounded-lg border border-cu-border bg-cu-panel px-2 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Preset buttons */}
            {(
              [
                { id: "today", label: "Today" },
                { id: "endlastmonth", label: "End of Last Month" },
                { id: "6monthsago", label: "6 Months Ago" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setCumulativePreset(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  cumulativePreset === p.id
                    ? "border-cu-purple bg-cu-purple-light text-cu-purple"
                    : "border-cu-border bg-cu-panel text-cu-text-secondary hover:border-cu-purple/40 hover:text-cu-text"
                )}
              >
                {p.label}
              </button>
            ))}

            {/* Custom date picker */}
            {cumulativePreset === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-[11px] font-medium text-cu-text-tertiary">As of</span>
                <input
                  type="date"
                  value={customCutoffDate}
                  onChange={(e) => setCustomCutoffDate(e.target.value)}
                  className="h-7 rounded-lg border border-cu-border bg-cu-panel px-2 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple"
                />
              </div>
            )}
          </div>
        )}

        {/* Summary line */}
        {!isLoading && data && (
          <p className="mt-1.5 text-[11px] text-cu-text-tertiary">{summaryLabel}</p>
        )}
      </div>

      {/* Responsible persons strip */}
      {!isLoading && !hasError && data && (
        <ResponsibleStrip
          tasks={currentTabTasks}
          assigneeFilter={assigneeFilter}
          onToggle={(id) => setAssigneeFilter((prev) => (prev === id ? null : id))}
          onClear={() => setAssigneeFilter(null)}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TABS
      ════════════════════════════════════════════════════════════════════ */}
      {!isLoading && !hasError && data && (
        <TabNav
          tabs={currentTabDefs}
          active={activeTab}
          onSelect={handleTabSelect}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SCROLLABLE CONTENT
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2 p-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-10 animate-pulse items-center gap-3 rounded-lg bg-cu-hover/80 px-4">
                <div className="h-2.5 w-2.5 rounded-full bg-cu-border" />
                <div className="h-3 flex-1 rounded bg-cu-border" style={{ maxWidth: `${40 + (i * 13) % 40}%` }} />
                <div className="h-3 w-14 rounded bg-cu-border" />
              </div>
            ))}
          </div>
        )}

        {/* Main content */}
        {!isLoading && !hasError && data && (
          <div>
            {/* Filter bar */}
            <div className="flex items-center gap-3 border-b border-cu-border bg-cu-panel/60 px-6 py-2.5">
              {/* Status filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-7 appearance-none rounded-lg border border-cu-border bg-cu-panel pl-2.5 pr-7 text-[12px] text-cu-text focus:outline-none focus:ring-1 focus:ring-cu-purple cursor-pointer"
                >
                  <option value="__all__">All statuses</option>
                  {availableStatuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-cu-text-tertiary" />
              </div>

              {/* Search */}
              <div className="relative flex items-center">
                <Search className="absolute left-2 h-3.5 w-3.5 text-cu-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name…"
                  className="h-7 min-w-[180px] rounded-lg border border-cu-border bg-cu-panel pl-7 pr-2.5 text-[12px] text-cu-text placeholder:text-cu-text-tertiary focus:outline-none focus:ring-1 focus:ring-cu-purple"
                />
              </div>

              {/* Active tab indicator dot */}
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-cu-text-tertiary">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: activeTabColor }}
                />
                {currentTabDefs.find((t) => t.id === activeTab)?.label}
                {" · "}
                {currentTabTasks.length} tasks
              </span>
            </div>

            {/* Task list */}
            <div className="rounded-none">
              {currentTabTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                  <span className="text-4xl">
                    {activeTab === "completed" ? "✓" : activeTab === "overdue" ? "⏰" : "📋"}
                  </span>
                  <p className="text-[14px] font-medium text-cu-text-secondary">No tasks in this category</p>
                  <p className="text-[12px] text-cu-text-tertiary max-w-xs">
                    {mainView === "period"
                      ? "Adjust the period range to see more activity"
                      : "Adjust the cutoff date to see more tasks"}
                  </p>
                </div>
              ) : (
                <TaskList
                  tasks={currentTabTasks}
                  tab={activeTab as PeriodTab & CumulativeTab}
                  periodEndMs={mainView === "period" ? periodEndMs : undefined}
                  cutoffMs={mainView === "cumulative" ? cutoffMs : undefined}
                  searchTerm={searchTerm}
                  statusFilter={statusFilter}
                />
              )}
            </div>

            {/* Deep analytics (collapsed) */}
            <div className="border-t border-cu-border mt-2">
              <button
                onClick={() => setAnalyticsOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-6 py-3 text-[12px] font-medium text-cu-text-secondary transition-colors hover:bg-cu-hover"
              >
                <BarChart2 className="h-4 w-4 text-cu-text-tertiary" />
                <span>Show analytics</span>
                {analyticsOpen ? (
                  <ChevronDown className="ml-auto h-3.5 w-3.5 text-cu-text-tertiary" />
                ) : (
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-cu-text-tertiary" />
                )}
              </button>

              {analyticsOpen && (
                <div className="border-t border-cu-border bg-cu-hover/30 px-6 py-5">
                  {/* Placeholder — wire in your existing analytics components here */}
                  <p className="text-[12px] text-cu-text-tertiary text-center py-4">
                    Activity heatmap and space breakdown charts will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
