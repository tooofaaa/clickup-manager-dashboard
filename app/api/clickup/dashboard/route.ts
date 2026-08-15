import { NextResponse } from "next/server";
import { getMe, getMembers, getSpaces, getTasks, getTimeEntries, type CUTask } from "@/lib/clickup-client";

export async function GET(req: Request) {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) return NextResponse.json({ error: "CLICKUP_TEAM_ID not set" }, { status: 400 });
  const spaceId = new URL(req.url).searchParams.get("spaceId") ?? undefined;

  try {
    const now = Date.now();
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;

    const [me, members, spaces, tasks, timeEntries] = await Promise.all([
      getMe(),
      getMembers(teamId),
      getSpaces(teamId),
      getTasks(teamId, { include_closed: false, ...(spaceId ? { space_ids: spaceId } : {}) }),
      getTimeEntries(teamId, weekStart, now),
    ]);

    const overdue = tasks.filter(t =>
      t.due_date && Number(t.due_date) < now && t.status.type !== "closed" && t.status.type !== "done"
    );

    const workload: Record<string, { member: (typeof members)[0]; tasks: CUTask[]; overdueCount: number }> = {};
    for (const m of members) workload[m.id] = { member: m, tasks: [], overdueCount: 0 };
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (workload[a.id]) {
          workload[a.id].tasks.push(t);
          if (t.due_date && Number(t.due_date) < now) workload[a.id].overdueCount++;
        }
      }
    }

    const timeByMember: Record<string, number> = {};
    for (const e of timeEntries) {
      const uid = String(e.user.id);
      timeByMember[uid] = (timeByMember[uid] ?? 0) + e.duration;
    }

    const spaceHealth = spaces.map(s => {
      const st = tasks.filter(t => t.space.id === s.id);
      const done = st.filter(t => t.status.type === "done" || t.status.type === "closed").length;
      const overdueCount = st.filter(t => t.due_date && Number(t.due_date) < now && t.status.type !== "done" && t.status.type !== "closed").length;
      return { id: s.id, name: s.name, color: s.color ?? "#7b68ee", total: st.length, done, overdue: overdueCount, pct: st.length > 0 ? Math.round((done / st.length) * 100) : 0 };
    });

    return NextResponse.json({
      me, members, spaces: spaceHealth, workload: Object.values(workload), overdue,
      recentTasks: [...tasks].sort((a, b) => Number(b.date_updated) - Number(a.date_updated)).slice(0, 30),
      timeByMember,
      totals: { tasks: tasks.length, overdue: overdue.length, members: members.length, hoursThisWeek: Math.round(Object.values(timeByMember).reduce((a, b) => a + b, 0) / 3_600_000) },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
