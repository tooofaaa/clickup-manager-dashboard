import { NextResponse } from "next/server";
import {
  getMe,
  getMembers,
  getSpaces,
  getTasks,
  getTimeEntries,
  type CUUser,
  type CUMemberUser,
  type CUTask,
} from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

/** Safely settle a promise and return its value or a fallback. */
async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[dashboard] partial fetch failed:", err);
    return fallback;
  }
}

export async function GET(req: Request) {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId)
    return NextResponse.json({ error: "CLICKUP_TEAM_ID not set" }, { status: 400 });

  const spaceId = new URL(req.url).searchParams.get("spaceId") ?? undefined;

  const now = Date.now();
  // Use Monday of the current ISO week as the week boundary.
  const d = new Date(now);
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mondayOffset)
  ).getTime();

  // Build task query params.  ClickUp expects space_ids[] as repeated params but
  // getTasks uses URLSearchParams.set which produces a single key; that is the
  // correct wire format for the v2 endpoint when filtering by one space.
  const taskParams: Record<string, string | number | boolean> = {
    include_closed: false,
    ...(spaceId ? { "space_ids[]": spaceId } : {}),
  };

  // Fetch all five data-sources in parallel; a failure in any one returns its
  // typed fallback so the rest of the dashboard still renders.
  const [me, members, spaces, tasks, timeEntries] = await Promise.all([
    settle(getMe(), null as unknown as CUUser),
    settle(getMembers(teamId), [] as CUMemberUser[]),
    settle(getSpaces(teamId), []),
    settle(getTasks(teamId, taskParams), [] as CUTask[]),
    settle(getTimeEntries(teamId, weekStart, now), []),
  ]);

  // ── overdue ──────────────────────────────────────────────────────────────
  const overdue = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  // ── workload ─────────────────────────────────────────────────────────────
  // CUMemberUser.id is a number; use String(id) as the map key throughout.
  const workload: Record<
    string,
    { member: CUMemberUser; tasks: CUTask[]; overdueCount: number }
  > = {};

  for (const m of members) {
    workload[String(m.id)] = { member: m, tasks: [], overdueCount: 0 };
  }

  for (const t of tasks) {
    for (const a of t.assignees) {
      const key = String(a.id);
      if (workload[key]) {
        workload[key].tasks.push(t);
        // Only count as overdue when the task is actually open/active.
        if (
          t.due_date &&
          Number(t.due_date) < now &&
          t.status.type !== "done" &&
          t.status.type !== "closed"
        ) {
          workload[key].overdueCount++;
        }
      }
    }
  }

  // ── timeByMember ─────────────────────────────────────────────────────────
  // duration is in milliseconds; keep as-is here, convert to hours in totals.
  const timeByMember: Record<string, number> = {};
  for (const e of timeEntries) {
    const uid = String(e.user.id);
    timeByMember[uid] = (timeByMember[uid] ?? 0) + e.duration;
  }

  // ── spaceHealth ──────────────────────────────────────────────────────────
  const spaceHealth = spaces.map((s) => {
    const spaceTasks = tasks.filter((t) => t.space.id === s.id);
    const total = spaceTasks.length;
    const done = spaceTasks.filter(
      (t) => t.status.type === "done" || t.status.type === "closed"
    ).length;
    const overdueCount = spaceTasks.filter(
      (t) =>
        t.due_date &&
        Number(t.due_date) < now &&
        t.status.type !== "done" &&
        t.status.type !== "closed"
    ).length;
    // Guard against division by zero when a space has no tasks.
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      id: s.id,
      name: s.name,
      color: s.color ?? "#7b68ee",
      total,
      done,
      overdue: overdueCount,
      pct,
    };
  });

  // ── recentTasks ──────────────────────────────────────────────────────────
  const recentTasks = [...tasks]
    .sort((a, b) => Number(b.date_updated) - Number(a.date_updated))
    .slice(0, 30);

  // ── totals ───────────────────────────────────────────────────────────────
  const totalMs = Object.values(timeByMember).reduce((sum, ms) => sum + ms, 0);
  // Convert milliseconds → hours (round to one decimal place).
  const hoursThisWeek = Math.round((totalMs / 3_600_000) * 10) / 10;

  return NextResponse.json({
    me,
    members,
    spaces: spaceHealth,
    workload: Object.values(workload),
    overdue,
    recentTasks,
    timeByMember,
    totals: {
      tasks: tasks.length,
      overdue: overdue.length,
      members: members.length,
      hoursThisWeek,
    },
  });
}
