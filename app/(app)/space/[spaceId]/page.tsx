"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Folder,
  List,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Calendar,
  Clock,
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
// View mode type
// ---------------------------------------------------------------------------

type ViewMode = "project" | "person" | "timeline";

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  urgent: { color: "var(--cu-urgent)", label: "Urgent" },
  high: { color: "var(--cu-high)", label: "High" },
  normal: { color: "var(--cu-normal)", label: "Normal" },
  low: { color: "var(--cu-low)", label: "Low" },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isOverdue(task: CUTask): boolean {
  if (!task.due_date) return false;
  const dueMs = Number(task.due_date);
  const isOpen = task.status.type !== "closed" && task.status.type !== "done";
  return isOpen && dueMs < Date.now();
}

function formatDue(dueDateMs: string): string {
  return format(new Date(Number(dueDateMs)), "MMM d");
}

// ---------------------------------------------------------------------------
// AssigneeAvatar
// ---------------------------------------------------------------------------
function AssigneeAvatar({
  user,
  size = 20,
}: {
  user: { username?: string | null; email: string; color?: string | null; profilePicture?: string | null; initials: string };
  size?: number;
}) {
  const bg = user.color ?? "var(--cu-purple)";
  const style = {
    width: size,
    height: size,
    minWidth: size,
    fontSize: size * 0.38,
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
// TaskRow
// ---------------------------------------------------------------------------
function TaskRow({ task }: { task: CUTask }) {
  const overdue = isOverdue(task);
  const priority = task.priority?.priority?.toLowerCase();
  const priorityConfig = priority ? PRIORITY_CONFIG[priority] : null;

  // Show max 3 assignees, then +N overflow
  const visibleAssignees = task.assignees.slice(0, 3);
  const overflow = task.assignees.length - 3;

  return (
    <a
      href={task.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-cu-hover"
    >
      {/* Status dot */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: task.status.color || "var(--cu-text-tertiary)" }}
        title={task.status.status}
      />

      {/* Task name */}
      <span className="min-w-0 flex-1 truncate text-[12px] text-cu-text">
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
          {overflow > 0 && (
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-cu-hover text-[9px] font-semibold text-cu-text-secondary">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium",
            overdue ? "text-red-500" : "text-cu-text-tertiary"
          )}
        >
          {formatDue(task.due_date)}
        </span>
      )}

      {/* Priority badge */}
      {priorityConfig && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: priorityConfig.color }}
          title={priorityConfig.label}
        />
      )}

      {/* "Open in ClickUp" hover link */}
      <ExternalLink className="h-3 w-3 shrink-0 text-cu-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Count badge
// ---------------------------------------------------------------------------
function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-1.5 rounded-full bg-cu-hover px-1.5 py-0.5 text-[10px] font-medium text-cu-text-secondary">
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BY PROJECT view
// ---------------------------------------------------------------------------

interface ByProjectViewProps {
  folders: FolderItem[];
  folderlessLists: FolderListItem[];
  byList: ByListEntry[];
}

function ByProjectView({ folders, folderlessLists, byList }: ByProjectViewProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());

  // Build a map: listId → ByListEntry for quick lookup
  const listTaskMap = useMemo(() => {
    const m = new Map<string, CUTask[]>();
    for (const entry of byList) {
      m.set(entry.listId, entry.tasks);
    }
    return m;
  }, [byList]);

  function toggleFolder(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function toggleList(listId: string) {
    setCollapsedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }

  // Ungrouped: folderless lists
  const ungroupedLists = folderlessLists.filter((l) => listTaskMap.has(l.id) || l.taskCount > 0);

  // If no data at all for a folder, still show it from the folders array
  // (some lists may have 0 tasks but still need to show)
  const allFolders = folders;

  return (
    <div className="space-y-4">
      {/* Folders */}
      {allFolders.map((folder) => {
        const folderTasks = folder.lists.flatMap((l) => listTaskMap.get(l.id) ?? []);
        const folderCollapsed = collapsedFolders.has(folder.id);

        return (
          <div
            key={folder.id}
            className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden"
          >
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(folder.id)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-cu-hover"
            >
              <Folder className="h-4 w-4 shrink-0 text-cu-purple" />
              <span className="flex-1 text-[13px] font-semibold text-cu-text">
                {folder.name}
              </span>
              <CountBadge count={folderTasks.length} />
              {folderCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
              )}
            </button>

            {/* Lists */}
            {!folderCollapsed && (
              <div className="border-t border-cu-border divide-y divide-cu-border">
                {folder.lists.map((list) => {
                  const tasks = listTaskMap.get(list.id) ?? [];
                  const listCollapsed = collapsedLists.has(list.id);

                  return (
                    <div key={list.id}>
                      <button
                        onClick={() => toggleList(list.id)}
                        className="flex w-full items-center gap-2 bg-cu-hover/40 px-4 py-2 text-left transition-colors hover:bg-cu-hover"
                      >
                        <List className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
                        <span className="flex-1 text-[12px] font-medium text-cu-text-secondary">
                          {list.name}
                        </span>
                        <CountBadge count={tasks.length} />
                        {listCollapsed ? (
                          <ChevronRight className="h-3 w-3 shrink-0 text-cu-text-tertiary" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0 text-cu-text-tertiary" />
                        )}
                      </button>

                      {!listCollapsed && tasks.length > 0 && (
                        <div className="max-h-80 overflow-y-auto px-2 py-1">
                          {tasks.map((task) => (
                            <TaskRow key={task.id} task={task} />
                          ))}
                        </div>
                      )}

                      {!listCollapsed && tasks.length === 0 && (
                        <p className="px-4 py-3 text-[12px] text-cu-text-tertiary">
                          No tasks in this list.
                        </p>
                      )}
                    </div>
                  );
                })}
                {folder.lists.length === 0 && (
                  <p className="px-4 py-3 text-[12px] text-cu-text-tertiary">
                    No lists in this folder.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped / folderless lists */}
      {(ungroupedLists.length > 0 || folderlessLists.length > 0) && (
        <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
          {/* Ungrouped header */}
          <div className="flex items-center gap-2 border-b border-cu-border px-4 py-3">
            <List className="h-4 w-4 shrink-0 text-cu-text-tertiary" />
            <span className="flex-1 text-[13px] font-semibold text-cu-text">
              Ungrouped
            </span>
            <CountBadge
              count={folderlessLists.reduce(
                (sum, l) => sum + (listTaskMap.get(l.id)?.length ?? 0),
                0
              )}
            />
          </div>

          <div className="divide-y divide-cu-border">
            {folderlessLists.map((list) => {
              const tasks = listTaskMap.get(list.id) ?? [];
              const listCollapsed = collapsedLists.has(`fl-${list.id}`);

              return (
                <div key={list.id}>
                  <button
                    onClick={() =>
                      setCollapsedLists((prev) => {
                        const next = new Set(prev);
                        const key = `fl-${list.id}`;
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2 bg-cu-hover/40 px-4 py-2 text-left transition-colors hover:bg-cu-hover"
                  >
                    <List className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
                    <span className="flex-1 text-[12px] font-medium text-cu-text-secondary">
                      {list.name}
                    </span>
                    <CountBadge count={tasks.length} />
                    {listCollapsed ? (
                      <ChevronRight className="h-3 w-3 shrink-0 text-cu-text-tertiary" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 text-cu-text-tertiary" />
                    )}
                  </button>

                  {!listCollapsed && tasks.length > 0 && (
                    <div className="max-h-80 overflow-y-auto px-2 py-1">
                      {tasks.map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </div>
                  )}

                  {!listCollapsed && tasks.length === 0 && (
                    <p className="px-4 py-3 text-[12px] text-cu-text-tertiary">
                      No tasks in this list.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No folders or lists */}
      {allFolders.length === 0 && folderlessLists.length === 0 && (
        <EmptyState message="No lists or folders found in this space." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BY PERSON view
// ---------------------------------------------------------------------------

interface PersonSectionProps {
  entry: ByAssigneeEntry;
}

function PersonSection({ entry }: PersonSectionProps) {
  const [expanded, setExpanded] = useState(entry.tasks.length <= 10);

  const openCount = entry.tasks.filter((t) => t.status.type === "open").length;
  const inProgressCount = entry.tasks.filter((t) => t.status.type === "custom").length;
  const overdueCount = entry.tasks.filter(isOverdue).length;

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
      {/* Person header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cu-hover"
      >
        {/* Avatar */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold text-white text-[11px] uppercase"
          style={{
            backgroundColor: entry.assigneeColor ?? "var(--cu-purple)",
            backgroundImage: entry.assigneeAvatar
              ? `url(${entry.assigneeAvatar})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {!entry.assigneeAvatar ? entry.assigneeInitials || "?" : null}
        </div>

        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-cu-text">
            {entry.assigneeName}
          </p>
          <p className="truncate text-[11px] text-cu-text-tertiary">
            {entry.assigneeEmail}
          </p>
        </div>

        {/* Task count badge */}
        <span className="shrink-0 rounded-full bg-cu-purple-light px-2 py-0.5 text-[11px] font-semibold text-cu-purple">
          {entry.tasks.length}
        </span>

        {/* Expand/collapse arrow */}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
        )}
      </button>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-1.5 border-t border-cu-border px-4 py-2">
        <span className="rounded-full border border-cu-border bg-cu-hover px-2 py-0.5 text-[11px] font-medium text-cu-text-secondary">
          <span className="font-bold text-cu-text">{openCount}</span> open
        </span>
        <span className="rounded-full border border-cu-border bg-cu-hover px-2 py-0.5 text-[11px] font-medium text-cu-text-secondary">
          <span className="font-bold text-cu-text">{inProgressCount}</span> in progress
        </span>
        {overdueCount > 0 && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            <span className="font-bold">{overdueCount}</span> overdue
          </span>
        )}
      </div>

      {/* Task list */}
      {expanded && (
        <div className="max-h-96 overflow-y-auto border-t border-cu-border px-2 py-1">
          {entry.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ByPersonViewProps {
  byAssignee: ByAssigneeEntry[];
  unassignedTasks: CUTask[];
}

function ByPersonView({ byAssignee, unassignedTasks }: ByPersonViewProps) {
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  return (
    <div className="space-y-3">
      {byAssignee.map((entry) => (
        <PersonSection key={entry.assigneeId} entry={entry} />
      ))}

      {/* Unassigned tasks */}
      {unassignedTasks.length > 0 && (
        <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
          <button
            onClick={() => setUnassignedExpanded((v) => !v)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cu-hover"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cu-hover">
              <User className="h-4 w-4 text-cu-text-tertiary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-cu-text">
                Unassigned Tasks
              </p>
              <p className="truncate text-[11px] text-cu-text-tertiary">
                No assignees
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-cu-border bg-cu-hover px-2 py-0.5 text-[11px] font-semibold text-cu-text-secondary">
              {unassignedTasks.length}
            </span>
            {unassignedExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cu-text-tertiary" />
            )}
          </button>

          {unassignedExpanded && (
            <div className="max-h-96 overflow-y-auto border-t border-cu-border px-2 py-1">
              {unassignedTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}

      {byAssignee.length === 0 && unassignedTasks.length === 0 && (
        <EmptyState message="No tasks assigned in this space." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TIMELINE view
// ---------------------------------------------------------------------------

interface TimelineViewProps {
  tasks: CUTask[];
}

function TimelineView({ tasks }: TimelineViewProps) {
  const now = Date.now();

  // Only tasks with due_date or start_date
  const datedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.due_date || t.start_date)
        .sort((a, b) => {
          // Overdue first, then by due date ascending
          const aOverdue = isOverdue(a) ? 0 : 1;
          const bOverdue = isOverdue(b) ? 0 : 1;
          if (aOverdue !== bOverdue) return aOverdue - bOverdue;
          const aDate = Number(a.due_date ?? a.start_date ?? "0");
          const bDate = Number(b.due_date ?? b.start_date ?? "0");
          return aDate - bDate;
        }),
    [tasks]
  );

  if (datedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cu-border py-16 text-center">
        <Calendar className="h-8 w-8 text-cu-text-tertiary" />
        <p className="text-[14px] font-medium text-cu-text">
          These tasks have no dates set
        </p>
        <p className="text-[13px] text-cu-text-tertiary">
          Add due dates or start dates to tasks in ClickUp to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-cu-border bg-cu-hover">
              <th className="min-w-[220px] px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Task
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Assignees
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Status
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Start
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Due
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-cu-text-secondary">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {datedTasks.map((task) => {
              const overdue = isOverdue(task);
              const startMs = task.start_date ? Number(task.start_date) : null;
              const dueMs = task.due_date ? Number(task.due_date) : null;

              // Duration in days (if both dates present)
              let durationLabel = "—";
              if (startMs && dueMs && dueMs > startMs) {
                const days = Math.round((dueMs - startMs) / 86_400_000);
                durationLabel = days === 1 ? "1d" : `${days}d`;
              } else if (dueMs && dueMs < now && !startMs) {
                // Only due date, already overdue
                durationLabel = "—";
              }

              return (
                <tr
                  key={task.id}
                  className={cn(
                    "border-b border-cu-border last:border-b-0 transition-colors hover:bg-cu-hover",
                    overdue && "bg-red-50/30"
                  )}
                >
                  {/* Task name */}
                  <td className="px-4 py-2.5">
                    <a
                      href={task.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1.5"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: task.status.color || "var(--cu-text-tertiary)" }}
                      />
                      <span
                        className={cn(
                          "line-clamp-1 max-w-[200px] text-[12px] font-medium group-hover:text-cu-purple",
                          overdue ? "text-red-600" : "text-cu-text"
                        )}
                      >
                        {task.name}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 text-cu-text-tertiary opacity-0 group-hover:opacity-100" />
                    </a>
                  </td>

                  {/* Assignees */}
                  <td className="px-4 py-2.5">
                    {task.assignees.length === 0 ? (
                      <span className="text-cu-text-tertiary">—</span>
                    ) : (
                      <div className="flex items-center -space-x-1">
                        {task.assignees.slice(0, 4).map((a) => (
                          <AssigneeAvatar
                            key={a.id}
                            user={{
                              username: a.username,
                              email: a.email,
                              color: a.color,
                              profilePicture: a.profilePicture,
                              initials: a.initials,
                            }}
                            size={20}
                          />
                        ))}
                        {task.assignees.length > 4 && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cu-hover text-[9px] font-semibold text-cu-text-secondary">
                            +{task.assignees.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: task.status.color || "var(--cu-text-secondary)",
                        backgroundColor: `${task.status.color}18`,
                      }}
                    >
                      {task.status.status}
                    </span>
                  </td>

                  {/* Start date */}
                  <td className="px-4 py-2.5 text-cu-text-secondary">
                    {startMs ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-cu-text-tertiary" />
                        {format(new Date(startMs), "MMM d")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Due date */}
                  <td className="px-4 py-2.5">
                    {dueMs ? (
                      <span
                        className={cn(
                          "flex items-center gap-1 font-medium",
                          overdue ? "text-red-500" : "text-cu-text-secondary"
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {format(new Date(dueMs), "MMM d, yyyy")}
                      </span>
                    ) : (
                      <span className="text-cu-text-tertiary">—</span>
                    )}
                  </td>

                  {/* Duration */}
                  <td className="px-4 py-2.5 text-cu-text-secondary">
                    {durationLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cu-border py-16 text-center">
      <Users className="h-8 w-8 text-cu-text-tertiary" />
      <p className="text-[14px] font-medium text-cu-text">
        No tasks in this space yet.
      </p>
      <p className="text-[13px] text-cu-text-tertiary">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function LoadingSkeleton({ mode }: { mode: ViewMode }) {
  if (mode === "timeline") {
    return (
      <div className="rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden animate-pulse">
        <div className="border-b border-cu-border bg-cu-hover px-4 py-2.5">
          <div className="h-3 w-64 rounded bg-cu-border" />
        </div>
        <div className="divide-y divide-cu-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2.5">
              <div className="h-3 w-40 rounded bg-cu-hover" />
              <div className="h-3 w-16 rounded bg-cu-hover" />
              <div className="h-3 w-20 rounded bg-cu-hover" />
              <div className="h-3 w-16 rounded bg-cu-hover" />
              <div className="h-3 w-16 rounded bg-cu-hover" />
              <div className="h-3 w-10 rounded bg-cu-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "person") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-cu-border bg-cu-panel p-4 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-cu-hover" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 rounded bg-cu-hover" />
                <div className="h-2.5 w-24 rounded bg-cu-hover" />
              </div>
              <div className="h-5 w-8 rounded-full bg-cu-hover" />
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-5 w-16 rounded-full bg-cu-hover" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Project mode skeleton
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-cu-border bg-cu-panel shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="h-4 w-4 rounded bg-cu-hover" />
            <div className="h-3 flex-1 max-w-[160px] rounded bg-cu-hover" />
            <div className="h-4 w-8 rounded-full bg-cu-hover" />
          </div>
          <div className="border-t border-cu-border px-4 py-2 space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-cu-hover" />
                <div className="h-2.5 flex-1 rounded bg-cu-hover" />
                <div className="h-2.5 w-12 rounded bg-cu-hover" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat chip
// ---------------------------------------------------------------------------
function StatChip({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px]",
        warn && value > 0
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-cu-border bg-cu-panel text-cu-text-secondary"
      )}
    >
      <span className={cn("text-[15px] font-bold", warn && value > 0 ? "text-red-700" : "text-cu-text")}>
        {value}
      </span>
      {label}
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

  const [viewMode, setViewMode] = useState<ViewMode>("project");

  const { data, isLoading, error } = useQuery<SpaceDetailResponse>({
    queryKey: ["space", spaceId],
    queryFn: async () => {
      const r = await fetch(`/api/clickup/space/${spaceId}`);
      if (!r.ok) {
        let body = "";
        try {
          body = await r.text();
        } catch {
          /* */
        }
        throw new Error(body || `HTTP ${r.status}`);
      }
      return r.json() as Promise<SpaceDetailResponse>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const hasError = !!error;
  const errMessage = hasError ? String(error).replace(/^Error:\s*/, "") : null;

  const space = data?.space;
  const stats = data?.stats;
  const hasNoTasks = !isLoading && data && stats?.totalTasks === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6 py-3.5">
        {/* Top row: back button + space name */}
        <div className="mb-2.5 flex items-center gap-3">
          <button
            onClick={() => router.push("/home")}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[12px] font-medium text-cu-text-secondary transition-colors hover:bg-cu-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {/* Space color swatch + name */}
          {space ? (
            <div className="flex items-center gap-2.5">
              <span
                className="h-5 w-5 shrink-0 rounded-md shadow-sm"
                style={{ backgroundColor: space.color ?? "var(--cu-purple)" }}
              />
              <h1 className="text-[18px] font-bold text-cu-text">{space.name}</h1>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 animate-pulse rounded-md bg-cu-hover" />
              <div className="h-5 w-40 animate-pulse rounded bg-cu-hover" />
            </div>
          )}
        </div>

        {/* Stats row */}
        {stats && (
          <div className="flex flex-wrap gap-2">
            <StatChip label="Total" value={stats.totalTasks} />
            <StatChip label="Open" value={stats.openTasks} />
            <StatChip label="In Progress" value={stats.inProgressTasks} />
            <StatChip label="Closed" value={stats.closedTasks} />
            <StatChip label="Overdue" value={stats.overdueTasks} warn />
            <StatChip label="Assignees" value={stats.uniqueAssignees} />
          </div>
        )}

        {/* Stats skeleton */}
        {isLoading && (
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-16 animate-pulse rounded-lg bg-cu-hover"
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {hasError && (
        <div className="shrink-0 border-b border-[#fca5a5] bg-[#fef2f2] px-6 py-2.5">
          <p className="text-[13px] font-medium text-[#991b1b]">
            Failed to load space data
            {errMessage ? ` — ${errMessage}` : ""}
          </p>
        </div>
      )}

      {/* ── View toggle ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-cu-border bg-cu-panel px-6">
        <div className="flex gap-0">
          {(
            [
              { id: "project" as const, label: "By Project" },
              { id: "person" as const, label: "By Person" },
              { id: "timeline" as const, label: "Timeline" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={cn(
                "relative px-4 py-2.5 text-[13px] font-medium transition-colors",
                viewMode === tab.id
                  ? "text-cu-purple"
                  : "text-cu-text-secondary hover:text-cu-text"
              )}
            >
              {tab.label}
              {viewMode === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: "var(--cu-purple)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Loading skeleton */}
        {isLoading && <LoadingSkeleton mode={viewMode} />}

        {/* Empty state */}
        {hasNoTasks && !hasError && (
          <EmptyState message="No tasks in this space yet. Add tasks in ClickUp." />
        )}

        {/* Content */}
        {!isLoading && !hasError && data && stats && stats.totalTasks > 0 && (
          <>
            {viewMode === "project" && (
              <ByProjectView
                folders={data.folders}
                folderlessLists={data.folderlessLists}
                byList={data.byList}
              />
            )}
            {viewMode === "person" && (
              <ByPersonView
                byAssignee={data.byAssignee}
                unassignedTasks={data.unassignedTasks}
              />
            )}
            {viewMode === "timeline" && <TimelineView tasks={data.tasks} />}
          </>
        )}
      </div>
    </div>
  );
}
