const BASE = "https://api.clickup.com/api/v2";

function headers() {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return { Authorization: token, "Content-Type": "application/json" };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type CUTeam   = { id: string; name: string; color: string; avatar: string | null };
export type CUMember = { id: number; username: string | null; email: string; color: string; profilePicture: string | null };
export type CUSpace  = { id: string; name: string; color: string | null; statuses: CUStatus[] };
export type CUStatus = { status: string; type: string; color: string; orderindex: number };
export type CUTask   = {
  id: string; name: string;
  status: { status: string; color: string; type: string };
  priority: { priority: string; color: string } | null;
  assignees: CUMember[];
  due_date: string | null;
  date_updated: string;
  list: { id: string; name: string };
  folder: { id: string; name: string };
  space: { id: string };
  url: string;
  tags: { name: string; tag_bg: string; tag_fg: string }[];
};
export type CUTimeEntry = {
  id: string;
  task: { id: string; name: string };
  user: CUMember;
  duration: number;
  start: string;
  end: string;
};

export async function getMe()                            { return (await get<{ user: CUMember }>("/user")).user; }
export async function getTeams()                         { return (await get<{ teams: CUTeam[] }>("/team")).teams; }
export async function getMembers(teamId: string)         { return (await get<{ members: { user: CUMember }[] }>(`/team/${teamId}/member`)).members.map(m => m.user); }
export async function getSpaces(teamId: string)          { return (await get<{ spaces: CUSpace[] }>(`/team/${teamId}/space?archived=false`)).spaces; }
export async function getTimeEntries(teamId: string, start: number, end: number) {
  return (await get<{ data: CUTimeEntry[] }>(`/team/${teamId}/time_entries?start_date=${start}&end_date=${end}`)).data ?? [];
}

export async function getTasks(teamId: string, params: Record<string, string | number | boolean> = {}) {
  const qs = new URLSearchParams({ subtasks: "true", order_by: "updated", reverse: "true" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const pages: CUTask[] = [];
  for (let page = 0; page <= 9; page++) {
    qs.set("page", String(page));
    const d = await get<{ tasks: CUTask[]; last_page?: boolean }>(`/team/${teamId}/task?${qs}`);
    pages.push(...d.tasks);
    if (d.last_page || d.tasks.length < 100) break;
  }
  return pages;
}
