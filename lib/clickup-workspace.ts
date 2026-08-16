/**
 * clickup-workspace.ts
 *
 * Fetches the full ClickUp workspace tree and returns it in the exact shape
 * that the app sidebar expects from getWorkspaceTree().
 *
 * API calls performed:
 *   GET /team/{teamId}                        → workspace name, color, members
 *   GET /team/{teamId}/space?archived=false   → spaces
 *   For each space (in parallel):
 *     GET /space/{spaceId}/folder?archived=false  → folders with inline lists
 *     GET /space/{spaceId}/list?archived=false    → folderless lists
 *
 * Results are cached via Next.js unstable_cache for 5 minutes (300 s).
 */

import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = "https://api.clickup.com/api/v2";

const TEAM_ID = process.env.CLICKUP_TEAM_ID;
if (!TEAM_ID) throw new Error("CLICKUP_TEAM_ID is not set");

const WORKSPACE_ID = `cu_${TEAM_ID}`;
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// App-shape types (what the sidebar / bootstrap layer expects)
// ---------------------------------------------------------------------------

export type WorkspaceMember = {
  user: {
    id: string;
    name: string;
    email: string;
    color: string;
    avatarUrl: string | null;
  };
};

export type WorkspaceList = {
  id: string;
  name: string;
  color: string | null;
  /** null for folderless lists, folder id for lists inside a folder */
  folderId: string | null;
  spaceId: string;
  _count: { tasks: number };
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  spaceId: string;
  lists: WorkspaceList[];
};

export type WorkspaceSpace = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  folders: WorkspaceFolder[];
  /** Folderless lists only */
  lists: WorkspaceList[];
};

export type WorkspaceTree = {
  id: string;
  name: string;
  color: string;
  members: WorkspaceMember[];
  spaces: WorkspaceSpace[];
};

// ---------------------------------------------------------------------------
// Raw ClickUp API shapes (minimally typed — only fields we consume)
// ---------------------------------------------------------------------------

type CURawMemberUser = {
  id: number;
  username: string | null;
  email: string;
  color: string | null;
  profilePicture: string | null;
};

type CURawTeamResponse = {
  team: {
    id: string;
    name: string;
    color: string;
    members: Array<{ user: CURawMemberUser }>;
  };
};

type CURawSpace = {
  id: string;
  name: string;
  color: string | null;
};

type CURawSpacesResponse = {
  spaces: CURawSpace[];
};

type CURawList = {
  id: string;
  name: string;
  task_count?: number | null;
};

type CURawFolder = {
  id: string;
  name: string;
  lists: CURawList[];
};

type CURawFoldersResponse = {
  folders: CURawFolder[];
};

type CURawListsResponse = {
  lists: CURawList[];
};

// ---------------------------------------------------------------------------
// Fetch helpers — mirrors the pattern in lib/clickup-client.ts
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
// Mappers
// ---------------------------------------------------------------------------

function mapMember(cu: CURawMemberUser): WorkspaceMember {
  return {
    user: {
      id: String(cu.id),
      name: cu.username ?? cu.email.split("@")[0],
      email: cu.email,
      color: cu.color ?? "#7b68ee",
      avatarUrl: cu.profilePicture ?? null,
    },
  };
}

function mapList(
  cu: CURawList,
  folderId: string | null,
  spaceId: string
): WorkspaceList {
  return {
    id: cu.id,
    name: cu.name,
    color: null,
    folderId,
    spaceId,
    _count: { tasks: cu.task_count ?? 0 },
  };
}

function mapFolder(cu: CURawFolder, spaceId: string): WorkspaceFolder {
  return {
    id: cu.id,
    name: cu.name,
    spaceId,
    lists: (cu.lists ?? []).map((l) => mapList(l, cu.id, spaceId)),
  };
}

// ---------------------------------------------------------------------------
// Core fetcher (uncached)
// ---------------------------------------------------------------------------

async function fetchWorkspaceTree(): Promise<WorkspaceTree> {
  // 1. Workspace metadata + members
  const teamData = await cuGet<CURawTeamResponse>(`/team/${TEAM_ID}`);
  const { team } = teamData;

  const members: WorkspaceMember[] = (team.members ?? []).map((m) =>
    mapMember(m.user)
  );

  // 2. Spaces
  const spacesData = await cuGet<CURawSpacesResponse>(
    `/team/${TEAM_ID}/space?archived=false`
  );
  const rawSpaces = spacesData.spaces ?? [];

  // 3. For each space, fetch folders + folderless lists in parallel
  const spaces: WorkspaceSpace[] = await Promise.all(
    rawSpaces.map(async (rawSpace): Promise<WorkspaceSpace> => {
      try {
        const [foldersData, listsData] = await Promise.all([
          cuGet<CURawFoldersResponse>(
            `/space/${rawSpace.id}/folder?archived=false`
          ),
          cuGet<CURawListsResponse>(
            `/space/${rawSpace.id}/list?archived=false`
          ),
        ]);

        const folders: WorkspaceFolder[] = (foldersData.folders ?? []).map(
          (f) => mapFolder(f, rawSpace.id)
        );

        const lists: WorkspaceList[] = (listsData.lists ?? []).map((l) =>
          mapList(l, null, rawSpace.id)
        );

        return {
          id: rawSpace.id,
          name: rawSpace.name,
          color: rawSpace.color ?? null,
          icon: null,
          folders,
          lists,
        };
      } catch (err) {
        // Degrade gracefully: return the space with empty folders/lists
        console.error(
          `[clickup-workspace] Failed to load folders/lists for space ${rawSpace.id} (${rawSpace.name}):`,
          err
        );
        return {
          id: rawSpace.id,
          name: rawSpace.name,
          color: rawSpace.color ?? null,
          icon: null,
          folders: [],
          lists: [],
        };
      }
    })
  );

  return {
    id: WORKSPACE_ID,
    name: team.name,
    color: team.color ?? "#7b68ee",
    members,
    spaces,
  };
}

// ---------------------------------------------------------------------------
// Public export — cached via Next.js unstable_cache (5-minute TTL)
// ---------------------------------------------------------------------------

export const getCUWorkspaceTree: () => Promise<WorkspaceTree> = unstable_cache(
  fetchWorkspaceTree,
  ["cu-workspace-tree"],
  { revalidate: 300 }
);
