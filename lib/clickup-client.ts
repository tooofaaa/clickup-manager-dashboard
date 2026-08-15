/**
 * ClickUp API v2 client
 *
 * Types are derived from live API audit results — field names, nullability,
 * and ID types are verified against actual responses.
 *
 * Key facts from the audit:
 *  - user.id is a NUMBER; task/list/folder/space/team IDs are STRINGS
 *  - All timestamps (date_created, date_updated, due_date, etc.) are STRINGS
 *    containing millisecond epoch values, not numbers
 *  - profilePicture, username, color, due_date, priority, date_closed,
 *    date_done, and parent can all be null
 *  - task.space only contains { id } — no name
 *  - GET /team/{id}/member returns 404; use GET /team/{id} and read .team.members
 */

const BASE = "https://api.clickup.com/api/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Exported types — single source of truth for dashboard components
// ---------------------------------------------------------------------------

/** Authenticated user — from GET /api/v2/user */
export type CUUser = {
  id: number;
  username: string;
  email: string;
  color: string;
  profilePicture: string | null;
  initials: string;
  week_start_day: number | null;
  global_font_support: boolean;
  timezone: string;
};

/** Team — from GET /api/v2/team */
export type CUTeam = {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
};

/** User shape that appears inside team member lists and task fields */
export type CUMemberUser = {
  id: number;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
  initials: string;
  role?: number;
  role_subtype?: number;
  role_key?: string;
  custom_role?: null;
  date_joined?: string | null;
  date_invited?: string;
};

/** Invited-by sub-object present on most team members */
export type CUInvitedBy = {
  id: number;
  username: string | null;
  email: string;
  color: string | null;
  initials: string;
  profilePicture: string | null;
};

/** Full team member entry from GET /api/v2/team/{id} */
export type CUTeamMember = {
  user: CUMemberUser;
  invited_by?: CUInvitedBy;
};

/** Space — from GET /api/v2/team/{id}/space */
export type CUStatus = {
  id: string;
  status: string;
  type: string;
  color: string;
  orderindex: number;
};

export type CUSpace = {
  id: string;
  name: string;
  /** Can be null — at least one space (Finance Management) has no color */
  color: string | null;
  avatar: string | null;
  statuses: CUStatus[];
};

/** Priority sub-object on tasks — entirely absent (null) for un-prioritised tasks */
export type CUPriority = {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
};

/** Status sub-object on tasks */
export type CUTaskStatus = {
  id: string;
  status: string;
  color: string;
  type: string;
  orderindex: number;
};

export type CUTag = {
  name: string;
  tag_bg: string;
  tag_fg: string;
};

/** Task — from GET /api/v2/team/{id}/task */
export type CUTask = {
  id: string;
  custom_id: string | null;
  custom_item_id: number;
  name: string;
  text_content: string | null;
  description: string | null;
  status: CUTaskStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  archived: boolean;
  creator: {
    id: number;
    username: string | null;
    color: string | null;
    email: string;
    profilePicture: string | null;
  };
  /** Can be empty array */
  assignees: CUMemberUser[];
  group_assignees: unknown[];
  watchers: unknown[];
  checklists: unknown[];
  tags: CUTag[];
  /** null for top-level tasks */
  parent: string | null;
  top_level_parent: string | null;
  /** null when no priority is set */
  priority: CUPriority | null;
  /** null when no due date is set; string of ms epoch when set */
  due_date: string | null;
  start_date: string | null;
  points: null;
  time_estimate: number | null;
  custom_fields: unknown[];
  dependencies: unknown[];
  linked_tasks: unknown[];
  locations: unknown[];
  team_id: string;
  url: string;
  list: { id: string; name: string; access: boolean };
  project: { id: string; name: string; hidden: boolean; access: boolean };
  folder: { id: string; name: string; hidden: boolean; access: boolean };
  /** NOTE: only { id } is returned — no name field */
  space: { id: string };
};

/** Time entry — from GET /api/v2/team/{id}/time_entries */
export type CUTimeEntry = {
  id: string;
  task: { id: string; name: string } | null;
  user: CUMemberUser;
  /** Duration in milliseconds */
  duration: number;
  /** Start time as ms epoch number */
  start: number;
  /** End time as ms epoch number */
  end: number;
};

// ---------------------------------------------------------------------------
// Internal fetch helpers
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return token;
}

function buildHeaders(): Record<string, string> {
  return {
    Authorization: getToken(),
    "Content-Type": "application/json",
  };
}

/**
 * Low-level GET with:
 *  - 10 s request timeout via AbortController
 *  - One automatic retry on HTTP 429 (rate limited) after a 1 s delay
 *  - No Next.js server-side caching (force-dynamic callers must set dynamic themselves)
 */
async function get<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  return fetchWithRetry<T>(url);
}

async function fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
      // Opt out of the Next.js per-fetch 60s revalidate cache so callers
      // control caching at the route level with `dynamic = 'force-dynamic'`
      cache: "no-store",
    });
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    throw new Error(
      isAbort
        ? `ClickUp request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`
        : `ClickUp fetch failed: ${String(err)}`
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  // Rate-limit: retry once after a short delay
  if (res.status === 429 && attempt === 0) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS)
    );
    return fetchWithRetry<T>(url, 1);
  }

  if (!res.ok) {
    // Do NOT forward the raw body to callers — it may contain token hints.
    // Throw a sanitised error; callers should log it server-side only.
    throw new Error(`ClickUp API error ${res.status} on ${url}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * GET /api/v2/user — returns the authenticated user.
 * Note: profilePicture and week_start_day may be null.
 */
export async function getMe(): Promise<CUUser> {
  const data = await get<{ user: CUUser }>("/user");
  return data.user;
}

/**
 * GET /api/v2/team — returns all teams (workspaces) the token can access.
 */
export async function getTeams(): Promise<CUTeam[]> {
  const data = await get<{ teams: CUTeam[] }>("/team");
  return data.teams;
}

/**
 * GET /api/v2/team/{id} — returns team metadata and full member list.
 *
 * IMPORTANT: GET /api/v2/team/{id}/member returns 404 in v2.
 * Always use this endpoint and read `.team.members`.
 */
export async function getTeamWithMembers(teamId: string): Promise<{
  team: CUTeam;
  members: CUTeamMember[];
}> {
  const data = await get<{
    team: CUTeam & { members: CUTeamMember[] };
  }>(`/team/${teamId}`);
  const { members, ...team } = data.team;
  return { team, members: members ?? [] };
}

/**
 * Convenience wrapper — returns only the flat array of member user objects.
 * username, color, and profilePicture can all be null.
 */
export async function getMembers(teamId: string): Promise<CUMemberUser[]> {
  const { members } = await getTeamWithMembers(teamId);
  return members.map((m) => m.user);
}

/**
 * GET /api/v2/team/{id}/space?archived=false — returns all non-archived spaces.
 * color may be null for some spaces.
 */
export async function getSpaces(teamId: string): Promise<CUSpace[]> {
  const data = await get<{ spaces: CUSpace[] }>(
    `/team/${teamId}/space?archived=false`
  );
  return data.spaces ?? [];
}

/**
 * GET /api/v2/team/{id}/task — fetches all tasks with pagination.
 *
 * Iterates up to 10 pages (each page = up to 100 tasks).
 * Stops when the API sets last_page=true or returns fewer than 100 tasks.
 *
 * For array-valued params (e.g. space_ids[], list_ids[]), pass them as
 * `{ "space_ids[]": ["id1", "id2"] }` — each value is appended separately.
 */
export async function getTasks(
  teamId: string,
  params: Record<string, string | number | boolean | string[]> = {}
): Promise<CUTask[]> {
  const qs = new URLSearchParams({
    subtasks: "true",
    order_by: "updated",
    reverse: "true",
  });

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      // ClickUp expects repeated params for arrays: space_ids[]=a&space_ids[]=b
      for (const item of value) {
        qs.append(key, String(item));
      }
    } else {
      qs.set(key, String(value));
    }
  }

  const allTasks: CUTask[] = [];

  for (let page = 0; page <= 9; page++) {
    qs.set("page", String(page));
    const data = await get<{ tasks: CUTask[]; last_page?: boolean }>(
      `/team/${teamId}/task?${qs.toString()}`
    );

    const tasks = data.tasks ?? [];
    allTasks.push(...tasks);

    // Stop when the API signals the last page or returns a partial page.
    // A partial page (< 100 items) reliably indicates end-of-data in ClickUp v2.
    if (data.last_page === true || tasks.length < 100) break;
  }

  return allTasks;
}

/**
 * GET /api/v2/team/{id}/time_entries — returns time entries in a date range.
 * start/end are millisecond epoch numbers.
 * Returns an empty array when no entries exist (the API returns { data: [] }).
 */
export async function getTimeEntries(
  teamId: string,
  start: number,
  end: number
): Promise<CUTimeEntry[]> {
  const data = await get<{ data: CUTimeEntry[] }>(
    `/team/${teamId}/time_entries?start_date=${start}&end_date=${end}`
  );
  return data.data ?? [];
}
