import { NextResponse } from "next/server";
import { getTasks, getSpaces, type CUTask } from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!isNaN(n) && n > 0) return n;
  const d = Date.parse(value);
  return isNaN(d) ? null : d;
}

function getResponsiblePersons(taskList: CUTask[]) {
  const personMap = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      color: string;
      avatar: string | null;
      count: number;
    }
  >();
  for (const task of taskList) {
    for (const a of task.assignees) {
      const key = String(a.id);
      if (!personMap.has(key)) {
        personMap.set(key, {
          id: key,
          name: a.username || a.email.split("@")[0],
          email: a.email,
          color: a.color ?? "#7b68ee",
          avatar: a.profilePicture,
          count: 0,
        });
      }
      personMap.get(key)!.count++;
    }
  }
  return [...personMap.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Local fetch helper — mirrors the pattern in lib/clickup-client.ts
// ---------------------------------------------------------------------------

const BASE = "https://api.clickup.com/api/v2";
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;

function buildHeaders(): Record<string, string> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return { Authorization: token, "Content-Type": "application/json" };
}

async function cuGet<T>(path: string, attempt = 0): Promise<T> {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    throw new Error(
      isAbort
        ? `ClickUp request timed out after ${TIMEOUT_MS}ms: ${url}`
        : `ClickUp fetch failed: ${String(err)}`
    );
  } finally {
    clearTimeout(tid);
  }

  if (res.status === 429 && attempt === 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return cuGet<T>(path, 1);
  }

  if (!res.ok) {
    throw new Error(`ClickUp API error ${res.status} on ${url}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API response types for folder/list endpoints
// ---------------------------------------------------------------------------

type APIList = { id: string; name: string; task_count: number | null };
type APIFolder = {
  id: string;
  name: string;
  orderindex: number;
  lists: APIList[];
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { searchParams } = new URL(req.url);
  const asOfParam = searchParams.get("asOf");

  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) {
    return NextResponse.json(
      { error: "CLICKUP_TEAM_ID not set" },
      { status: 400 }
    );
  }

  const { spaceId } = await params;

  // Phase 1 — parallel: all spaces (for metadata), folders, folderless lists, tasks
  // subtasks: true ensures subtasks are included in the flat tasks array
  const [spaces, foldersRes, folderlessRes, tasks] = await Promise.all([
    getSpaces(teamId),
    cuGet<{ folders: APIFolder[] }>(`/space/${spaceId}/folder?archived=false`),
    cuGet<{ lists: APIList[] }>(`/space/${spaceId}/list?archived=false`),
    getTasks(teamId, { include_closed: true, "space_ids[]": spaceId, subtasks: true }),
  ]);

  const spaceObj = spaces.find((s) => s.id === spaceId);
  if (!spaceObj) {
    return NextResponse.json(
      { error: `Space ${spaceId} not found` },
      { status: 404 }
    );
  }

  // Phase 2 — parallel: lists for each folder
  const folderListResults = await Promise.all(
    foldersRes.folders.map((f) =>
      cuGet<{ lists: APIList[] }>(`/folder/${f.id}/list?archived=false`)
    )
  );

  // Build folders with their resolved lists
  const folders = foldersRes.folders.map((f, i) => ({
    id: f.id,
    name: f.name,
    lists: (folderListResults[i]?.lists ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      taskCount: l.task_count ?? 0,
    })),
  }));

  const folderlessLists = folderlessRes.lists.map((l) => ({
    id: l.id,
    name: l.name,
    taskCount: l.task_count ?? 0,
  }));

  // ── byList ──────────────────────────────────────────────────────────────────
  // Build a map from listId → tasks for O(1) lookup during grouping
  const byListMap = new Map<string, CUTask[]>();
  for (const task of tasks) {
    const existing = byListMap.get(task.list.id);
    if (existing) {
      existing.push(task);
    } else {
      byListMap.set(task.list.id, [task]);
    }
  }

  type ByListEntry = {
    listId: string;
    listName: string;
    folderId: string | null;
    folderName: string | null;
    tasks: CUTask[];
    statusCounts: Record<string, number>;
  };

  const byList: ByListEntry[] = [];
  const seenListIds = new Set<string>();

  function computeStatusCounts(listTasks: CUTask[]): Record<string, number> {
    const statusCounts: Record<string, number> = {};
    for (const t of listTasks) {
      statusCounts[t.status.type] = (statusCounts[t.status.type] ?? 0) + 1;
    }
    return statusCounts;
  }

  // Foldered lists first (ordered by the folders array which preserves API order)
  for (const folder of folders) {
    for (const list of folder.lists) {
      const listTasks = byListMap.get(list.id) ?? [];
      byList.push({
        listId: list.id,
        listName: list.name,
        folderId: folder.id,
        folderName: folder.name,
        tasks: listTasks,
        statusCounts: computeStatusCounts(listTasks),
      });
      seenListIds.add(list.id);
    }
  }

  // Then folderless lists
  for (const list of folderlessLists) {
    const listTasks = byListMap.get(list.id) ?? [];
    byList.push({
      listId: list.id,
      listName: list.name,
      folderId: null,
      folderName: null,
      tasks: listTasks,
      statusCounts: computeStatusCounts(listTasks),
    });
    seenListIds.add(list.id);
  }

  // Catch any tasks in lists not returned by the folder/list calls
  for (const [listId, listTasks] of byListMap) {
    if (!seenListIds.has(listId)) {
      const ft = listTasks[0];
      byList.push({
        listId,
        listName: ft?.list.name ?? listId,
        folderId: ft?.folder.id ?? null,
        folderName: ft?.folder.name ?? null,
        tasks: listTasks,
        statusCounts: computeStatusCounts(listTasks),
      });
    }
  }

  // ── byAssignee ──────────────────────────────────────────────────────────────
  type AssigneeEntry = {
    assigneeId: string;
    assigneeName: string;
    assigneeEmail: string;
    assigneeColor: string;
    assigneeInitials: string;
    assigneeAvatar: string | null;
    tasks: CUTask[];
  };

  const assigneeMap = new Map<string, AssigneeEntry>();
  const unassignedTasks: CUTask[] = [];

  for (const task of tasks) {
    if (task.assignees.length === 0) {
      unassignedTasks.push(task);
    } else {
      for (const a of task.assignees) {
        const key = String(a.id);
        let entry = assigneeMap.get(key);
        if (!entry) {
          entry = {
            assigneeId: key,
            assigneeName: a.username ?? "",
            assigneeEmail: a.email,
            assigneeColor: a.color ?? "#7b68ee",
            assigneeInitials: a.initials,
            assigneeAvatar: a.profilePicture,
            tasks: [],
          };
          assigneeMap.set(key, entry);
        }
        entry.tasks.push(task);
      }
    }
  }

  // Sort by task count descending
  const byAssignee = Array.from(assigneeMap.values()).sort(
    (a, b) => b.tasks.length - a.tasks.length
  );

  // ── stats ───────────────────────────────────────────────────────────────────
  const now = Date.now();

  // ── asOf snapshot ──────────────────────────────────────────────────────────
  const asOfMs = parseTimestamp(asOfParam);

  type Snapshot = {
    asOfMs: number;
    totalExisted: number;
    openOnDate: number;
    closedByDate: number;
    overdueOnDate: number;
  };

  let snapshot: Snapshot | null = null;

  if (asOfMs) {
    const existedOnDate = tasks.filter(
      (t) => Number(t.date_created) <= asOfMs
    );

    const overdueOnDate = existedOnDate.filter(
      (t) =>
        t.due_date &&
        Number(t.due_date) < asOfMs &&
        (!t.date_closed || Number(t.date_closed) > asOfMs)
    );

    const closedByDate = tasks.filter(
      (t) => t.date_closed && Number(t.date_closed) <= asOfMs
    );

    const openOnDate = existedOnDate
      .filter(
        (t) => !t.date_closed || Number(t.date_closed) > asOfMs
      )
      .filter((t) => t.status.type !== "closed");

    snapshot = {
      asOfMs,
      totalExisted: existedOnDate.length,
      openOnDate: openOnDate.length,
      closedByDate: closedByDate.length,
      overdueOnDate: overdueOnDate.length,
    };
  }

  // ── status-filtered task lists (for responsibleByStatus) ───────────────────
  const overdueTaskList = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "closed"
  );
  const openTaskList = tasks.filter((t) => t.status.type === "open");
  const inProgressTaskList = tasks.filter(
    (t) => t.status.type === "custom"
  );
  const closedTaskList = tasks.filter((t) => t.status.type === "closed");

  // ── responsibleByStatus ────────────────────────────────────────────────────
  const responsibleByStatus = {
    overdue: getResponsiblePersons(overdueTaskList),
    open: getResponsiblePersons(openTaskList),
    inProgress: getResponsiblePersons(inProgressTaskList),
    closed: getResponsiblePersons(closedTaskList),
    all: getResponsiblePersons(tasks),
  };

  // ── statusSummary ──────────────────────────────────────────────────────────
  const statusSummary = {
    open: openTaskList.length,
    inProgress: inProgressTaskList.length,
    closed: closedTaskList.length,
    overdue: overdueTaskList.length,
  };

  // Priority breakdown across all tasks in the space
  const priorityBreakdown = { urgent: 0, high: 0, normal: 0, low: 0, none: 0 };
  for (const t of tasks) {
    const p = t.priority?.priority?.toLowerCase();
    if (p === "urgent") priorityBreakdown.urgent++;
    else if (p === "high") priorityBreakdown.high++;
    else if (p === "normal") priorityBreakdown.normal++;
    else if (p === "low") priorityBreakdown.low++;
    else priorityBreakdown.none++;
  }

  // ── recentActivity ─────────────────────────────────────────────────────────
  // Top 20 tasks sorted by date_updated descending — powers a "Recent Activity" feed
  const recentActivity = [...tasks]
    .sort((a, b) => Number(b.date_updated) - Number(a.date_updated))
    .slice(0, 20);

  // ── completionTrend ────────────────────────────────────────────────────────
  // Tasks closed per day for the last 7 days
  const completionTrend: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * 86400000;
    const dayEnd = dayStart + 86400000;
    const count = tasks.filter(
      (t) =>
        t.date_closed &&
        Number(t.date_closed) >= dayStart &&
        Number(t.date_closed) < dayEnd
    ).length;
    completionTrend.push({
      date: new Date(dayStart).toISOString().split("T")[0],
      count,
    });
  }

  // ── spaceMembersWithTasks ──────────────────────────────────────────────────
  // Unique assignees who have tasks in this space, with task counts
  const spaceMembersWithTasks = Array.from(assigneeMap.values()).map((e) => ({
    id: e.assigneeId,
    name: e.assigneeName,
    email: e.assigneeEmail,
    color: e.assigneeColor,
    avatar: e.assigneeAvatar,
    taskCount: e.tasks.length,
  }));

  return NextResponse.json({
    space: {
      id: spaceObj.id,
      name: spaceObj.name,
      color: spaceObj.color,
      statuses: spaceObj.statuses,
    },
    folders,
    folderlessLists,
    tasks,
    byList,
    byAssignee,
    unassignedTasks,
    recentActivity,
    completionTrend,
    spaceMembersWithTasks,
    ...(asOfMs !== null ? { asOfMs } : {}),
    ...(snapshot ? { snapshot } : {}),
    responsibleByStatus,
    statusSummary,
    stats: {
      totalTasks: tasks.length,
      openTasks: tasks.filter((t) => t.status.type === "open").length,
      inProgressTasks: tasks.filter((t) => t.status.type === "custom").length,
      closedTasks: tasks.filter((t) => t.status.type === "closed").length,
      overdueTasks: tasks.filter(
        (t) =>
          t.due_date && Number(t.due_date) < now && t.status.type !== "closed"
      ).length,
      tasksWithDueDates: tasks.filter((t) => t.due_date !== null).length,
      uniqueAssignees: assigneeMap.size,
      priorityBreakdown,
    },
  });
}
