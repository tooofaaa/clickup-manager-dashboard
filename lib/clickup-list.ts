/**
 * clickup-list.ts
 *
 * Fetches a single ClickUp list + its tasks and maps to the ListData shape
 * used by the dashboard's list view.
 *
 * API calls performed:
 *   GET /list/{listId}                                              → list metadata
 *   GET /list/{listId}/task?archived=false&subtasks=true&include_closed=false → tasks (paginated)
 *
 * No server-side caching — TanStack Query on the client handles caching.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = "https://api.clickup.com/api/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// App-shape types
// ---------------------------------------------------------------------------

export type StatusType = "NOT_STARTED" | "ACTIVE" | "DONE" | "CLOSED";

export type AppStatus = {
  id: string;
  status: string;
  color: string;
  type: StatusType;
  orderindex: number;
  position: number;
};

export type AppView = {
  id: string;
  type: string;
  position: number;
};

export type AppAssignee = {
  user: {
    id: string;
    name: string;
    email: string;
    color: string;
    avatarUrl: string | null;
  };
};

export type AppTag = {
  tag: {
    name: string;
    color: string;
  };
};

export type AppTask = {
  id: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  startDate: Date | null;
  archived: boolean;
  position: number;
  priority: string | null;
  url: string | null;
  parentId: string | null;
  listId: string;
  status: {
    id: string;
    status: string;
    color: string;
    type: StatusType;
    orderindex: number;
  };
  assignees: AppAssignee[];
  tags: AppTag[];
  customFieldValues: [];
  subtasks: [];
  _count: { comments: number; subtasks: number; checklists: number };
  createdAt: Date;
  updatedAt: Date;
};

export type ListData = {
  list: {
    id: string;
    name: string;
    color: string | null;
    space: { id: string; name: string; color: string; icon: string | null };
    folder: { id: string; name: string } | null;
    statuses: AppStatus[];
    customFields: [];
    views: AppView[];
  };
  tasks: AppTask[];
  dependencies: [];
};

// ---------------------------------------------------------------------------
// Raw ClickUp API shapes (only fields we consume)
// ---------------------------------------------------------------------------

type CURawStatus = {
  id?: string;
  status: string;
  color: string;
  type: string;
  orderindex: number;
};

type CURawView = {
  id: string;
  type: string;
  orderindex?: number;
};

type CURawList = {
  id: string;
  name: string;
  color?: string | null;
  space: { id: string; name: string; color?: string | null };
  folder?: { id: string; name: string; hidden?: boolean } | null;
  statuses?: CURawStatus[] | null;
  views?: CURawView[] | null;
};

type CURawMemberUser = {
  id: number;
  username?: string | null;
  email: string;
  color?: string | null;
  profilePicture?: string | null;
};

type CURawTag = {
  name: string;
  tag_bg: string;
};

type CURawTaskStatus = {
  id?: string;
  status: string;
  color: string;
  type: string;
  orderindex?: number;
};

type CURawPriority = {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
} | null;

type CURawTask = {
  id: string;
  name: string;
  description?: string | null;
  status: CURawTaskStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  archived: boolean;
  assignees: CURawMemberUser[];
  tags: CURawTag[];
  parent?: string | null;
  priority: CURawPriority;
  due_date?: string | null;
  start_date?: string | null;
  url: string;
};

// ---------------------------------------------------------------------------
// Fetch helpers — mirrors the pattern in lib/clickup-workspace.ts and lib/clickup-client.ts
// ---------------------------------------------------------------------------

function buildHeaders(): Record<string, string> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return {
    Authorization: token,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
        ? `ClickUp request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`
        : `ClickUp fetch failed: ${String(err)}`
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (res.status === 429 && attempt === 0) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS)
    );
    return fetchWithRetry<T>(url, 1);
  }

  if (!res.ok) {
    throw new Error(`ClickUp API error ${res.status} on ${url}`);
  }

  return res.json() as Promise<T>;
}

async function cuGet<T>(path: string): Promise<T> {
  return fetchWithRetry<T>(`${BASE}${path}`);
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapStatusType(type: string): StatusType {
  switch (type) {
    case "open":
      return "NOT_STARTED";
    case "custom":
    case "in_progress":
      return "ACTIVE";
    case "done":
      return "DONE";
    case "closed":
      return "CLOSED";
    default:
      return "ACTIVE";
  }
}

function defaultViews(listId: string): AppView[] {
  return [
    { id: `${listId}-list`, type: "LIST", position: 0 },
    { id: `${listId}-board`, type: "BOARD", position: 1 },
    { id: `${listId}-calendar`, type: "CALENDAR", position: 2 },
    { id: `${listId}-gantt`, type: "GANTT", position: 3 },
    { id: `${listId}-table`, type: "TABLE", position: 4 },
  ];
}

function mapStatuses(
  raw: CURawStatus[] | null | undefined,
  listId: string
): AppStatus[] {
  if (!raw || raw.length === 0) {
    return [
      {
        id: "1",
        status: "Open",
        color: "#87909e",
        type: "NOT_STARTED",
        orderindex: 0,
        position: 0,
      },
      {
        id: "2",
        status: "In Progress",
        color: "#5b9fff",
        type: "ACTIVE",
        orderindex: 1,
        position: 1,
      },
      {
        id: "3",
        status: "Closed",
        color: "#6bc950",
        type: "DONE",
        orderindex: 2,
        position: 2,
      },
    ];
  }
  return raw.map((s, i) => ({
    id: s.id ?? s.status,
    status: s.status,
    color: s.color,
    type: mapStatusType(s.type),
    orderindex: s.orderindex ?? i,
    position: i,
  }));
}

function mapTask(cu: CURawTask, listId: string): AppTask {
  return {
    id: cu.id,
    name: cu.name,
    description: cu.description || null,
    dueDate: cu.due_date ? new Date(Number(cu.due_date)) : null,
    startDate: cu.start_date ? new Date(Number(cu.start_date)) : null,
    archived: cu.archived,
    position: Number(cu.orderindex) || 0,
    priority: cu.priority?.priority || null,
    url: cu.url,
    parentId: cu.parent || null,
    listId,
    status: {
      id: cu.status.id || cu.status.status,
      status: cu.status.status,
      color: cu.status.color,
      type: mapStatusType(cu.status.type),
      orderindex: cu.status.orderindex || 0,
    },
    assignees: cu.assignees.map((a) => ({
      user: {
        id: String(a.id),
        name: a.username || a.email.split("@")[0],
        email: a.email,
        color: a.color || "#7b68ee",
        avatarUrl: a.profilePicture || null,
      },
    })),
    tags: cu.tags.map((t) => ({ tag: { name: t.name, color: t.tag_bg } })),
    customFieldValues: [],
    subtasks: [],
    _count: { comments: 0, subtasks: 0, checklists: 0 },
    createdAt: new Date(Number(cu.date_created)),
    updatedAt: new Date(Number(cu.date_updated)),
  };
}

// ---------------------------------------------------------------------------
// Task fetcher with pagination
// ---------------------------------------------------------------------------

async function fetchListTasks(listId: string): Promise<CURawTask[]> {
  const base =
    `/list/${listId}/task` +
    `?archived=false&subtasks=true&include_closed=false`;

  const allTasks: CURawTask[] = [];

  for (let page = 0; page <= 9; page++) {
    const data = await cuGet<{ tasks: CURawTask[]; last_page?: boolean }>(
      `${base}&page=${page}`
    );

    const tasks = data.tasks ?? [];
    allTasks.push(...tasks);

    // Stop when the API signals last page or returns a partial page
    if (data.last_page === true || tasks.length < 100) break;
  }

  return allTasks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches a ClickUp list and its tasks, mapping to the app's ListData shape.
 * Returns null if the API call fails (e.g. list not found, auth error).
 */
export async function getCUListData(listId: string): Promise<ListData | null> {
  try {
    const [listRaw, rawTasks] = await Promise.all([
      cuGet<CURawList>(`/list/${listId}`),
      fetchListTasks(listId),
    ]);

    const statuses = mapStatuses(listRaw.statuses, listId);

    const views: AppView[] =
      listRaw.views && listRaw.views.length > 0
        ? listRaw.views.map((v, i) => ({
            id: v.id,
            type: v.type.toUpperCase(),
            position: v.orderindex ?? i,
          }))
        : defaultViews(listId);

    // ClickUp returns folder with hidden:true for "No Folder" pseudo-folders
    const folder =
      listRaw.folder && listRaw.folder.hidden !== true
        ? { id: listRaw.folder.id, name: listRaw.folder.name }
        : null;

    const list: ListData["list"] = {
      id: listRaw.id,
      name: listRaw.name,
      color: listRaw.color ?? null,
      space: {
        id: listRaw.space.id,
        name: listRaw.space.name,
        color: listRaw.space.color ?? "#7b68ee",
        icon: null,
      },
      folder,
      statuses,
      customFields: [],
      views,
    };

    const tasks = rawTasks.map((cu) => mapTask(cu, listId));

    return { list, tasks, dependencies: [] };
  } catch (err) {
    console.error(`[getCUListData] Failed to fetch list ${listId}:`, err);
    return null;
  }
}

/** Alias matching the context description's getListData(listId) signature. */
export const getListData = getCUListData;
