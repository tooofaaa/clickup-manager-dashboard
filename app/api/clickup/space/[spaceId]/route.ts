import { NextResponse } from "next/server";
import { getTasks, getSpaces, type CUTask } from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

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
  _req: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) {
    return NextResponse.json(
      { error: "CLICKUP_TEAM_ID not set" },
      { status: 400 }
    );
  }

  const { spaceId } = await params;

  // Phase 1 — parallel: all spaces (for metadata), folders, folderless lists, tasks
  const [spaces, foldersRes, folderlessRes, tasks] = await Promise.all([
    getSpaces(teamId),
    cuGet<{ folders: APIFolder[] }>(`/space/${spaceId}/folder?archived=false`),
    cuGet<{ lists: APIList[] }>(`/space/${spaceId}/list?archived=false`),
    getTasks(teamId, { include_closed: true, "space_ids[]": spaceId }),
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
  };

  const byList: ByListEntry[] = [];
  const seenListIds = new Set<string>();

  // Foldered lists first (ordered by the folders array which preserves API order)
  for (const folder of folders) {
    for (const list of folder.lists) {
      byList.push({
        listId: list.id,
        listName: list.name,
        folderId: folder.id,
        folderName: folder.name,
        tasks: byListMap.get(list.id) ?? [],
      });
      seenListIds.add(list.id);
    }
  }

  // Then folderless lists
  for (const list of folderlessLists) {
    byList.push({
      listId: list.id,
      listName: list.name,
      folderId: null,
      folderName: null,
      tasks: byListMap.get(list.id) ?? [],
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
    },
  });
}
