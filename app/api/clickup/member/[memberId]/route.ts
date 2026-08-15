import { NextResponse } from "next/server";
import {
  getTasks,
  getTimeEntries,
  getTeamWithMembers,
  getSpaces,
  type CUTask,
  type CUTimeEntry,
  type CUMemberUser,
} from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

/** Safely settle a promise and return its value or a fallback. */
async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[member-profile] partial fetch failed:", err);
    return fallback;
  }
}

/** Return ISO week key "YYYY-WXX" for a given timestamp (ms epoch). */
function isoWeekKey(tsMs: number): string {
  const d = new Date(tsMs);
  // ISO week: Thursday-based week number
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const daysDiff = Math.floor((d.getTime() - startOfWeek1.getTime()) / 86_400_000);
  if (daysDiff < 0) {
    // Falls in last week of previous year
    return isoWeekKey(startOfWeek1.getTime() - 1);
  }
  const weekNum = Math.floor(daysDiff / 7) + 1;
  const year = startOfWeek1.getUTCFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/** Return Monday date string "YYYY-MM-DD" for the ISO week that contains tsMs. */
function isoWeekMonday(tsMs: number): string {
  const d = new Date(tsMs);
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mondayOffset)
  );
  return monday.toISOString().slice(0, 10);
}

/** Compute metrics for a member — same shape as team-eval metrics. */
function buildMetrics(
  tasks: CUTask[],
  timeEntries: CUTimeEntry[],
  periodStart: number,
  periodEnd: number
): {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  overdueCount: number;
  inProgressCount: number;
  totalTimeMs: number;
  totalTimeHours: number;
  avgTimePerTaskMs: number;
  tasksWithTime: number;
  onTimeCompletions: number;
  onTimeRate: number;
} {
  const now = Date.now();

  const completed = tasks.filter(
    (t) =>
      (t.status.type === "done" || t.status.type === "closed") &&
      Number(t.date_updated) >= periodStart &&
      Number(t.date_updated) <= periodEnd
  );

  const overdue = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  const inProgress = tasks.filter(
    (t) =>
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  const totalTimeMs = timeEntries.reduce((sum, e) => sum + e.duration, 0);
  const tasksWithTime = new Set(
    timeEntries.filter((e) => e.task).map((e) => e.task!.id)
  ).size;
  const avgTimePerTaskMs = tasksWithTime > 0 ? totalTimeMs / tasksWithTime : 0;

  // On-time: completed before or on due_date
  const onTimeCompletions = completed.filter(
    (t) =>
      t.due_date &&
      Number(t.date_updated) <= Number(t.due_date)
  ).length;

  const totalTasks = tasks.length;
  const completedCount = completed.length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const onTimeRate =
    completedCount > 0 ? Math.round((onTimeCompletions / completedCount) * 100) : 0;

  return {
    totalTasks,
    completedTasks: completedCount,
    completionRate,
    overdueCount: overdue.length,
    inProgressCount: inProgress.length,
    totalTimeMs,
    totalTimeHours: Math.round((totalTimeMs / 3_600_000) * 10) / 10,
    avgTimePerTaskMs: Math.round(avgTimePerTaskMs),
    tasksWithTime,
    onTimeCompletions,
    onTimeRate,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) {
    return NextResponse.json({ error: "CLICKUP_TEAM_ID not set" }, { status: 400 });
  }

  const { memberId } = await params;
  const { searchParams } = new URL(req.url);

  const now = Date.now();

  // Parse start/end with sensible defaults (last 30 days)
  const defaultStart = now - 30 * 24 * 60 * 60 * 1000;
  const startMs = searchParams.has("start")
    ? Number(searchParams.get("start"))
    : defaultStart;
  const endMs = searchParams.has("end") ? Number(searchParams.get("end")) : now;

  if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) {
    return NextResponse.json(
      { error: "Invalid start/end query params — provide millisecond epoch values" },
      { status: 400 }
    );
  }

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [tasks, timeEntries, teamData, spaces] = await Promise.all([
    settle(
      getTasks(teamId, {
        include_closed: true,
        "assignees[]": memberId,
      }),
      [] as CUTask[]
    ),
    settle(
      getTimeEntries(teamId, startMs, endMs).then((entries) =>
        entries.filter((e) => String(e.user.id) === memberId)
      ),
      [] as CUTimeEntry[]
    ),
    settle(getTeamWithMembers(teamId), {
      team: { id: teamId, name: "", color: "", avatar: null },
      members: [],
    }),
    settle(getSpaces(teamId), []),
  ]);

  // ── Resolve member details ────────────────────────────────────────────────
  const teamMember = teamData.members.find(
    (m) => String(m.user.id) === memberId
  );
  const memberUser: CUMemberUser | null = teamMember?.user ?? null;

  if (!memberUser) {
    return NextResponse.json(
      { error: `Member ${memberId} not found in team ${teamId}` },
      { status: 404 }
    );
  }

  const member = {
    id: memberUser.id,
    username: memberUser.username,
    email: memberUser.email,
    color: memberUser.color,
    profilePicture: memberUser.profilePicture,
    initials: memberUser.initials,
  };

  // ── Task buckets ──────────────────────────────────────────────────────────
  const inProgress = tasks.filter(
    (t) =>
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  const completed = tasks.filter(
    (t) =>
      (t.status.type === "done" || t.status.type === "closed") &&
      Number(t.date_updated) >= startMs &&
      Number(t.date_updated) <= endMs
  );

  const overdue = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  const fourteenDaysOut = now + 14 * 24 * 60 * 60 * 1000;
  const upcoming = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) > now &&
      Number(t.due_date) <= fourteenDaysOut &&
      t.status.type !== "done" &&
      t.status.type !== "closed"
  );

  // ── Activity heatmap ──────────────────────────────────────────────────────
  // Key: 'YYYY-MM-DD', value: count of tasks updated that day
  const activityHeatmap: Record<string, number> = {};
  for (const t of tasks) {
    const dateKey = new Date(Number(t.date_updated))
      .toISOString()
      .slice(0, 10);
    activityHeatmap[dateKey] = (activityHeatmap[dateKey] ?? 0) + 1;
  }

  // ── Space breakdown ───────────────────────────────────────────────────────
  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const spaceCountMap: Record<string, number> = {};
  for (const t of tasks) {
    spaceCountMap[t.space.id] = (spaceCountMap[t.space.id] ?? 0) + 1;
  }

  const spaceBreakdown = Object.entries(spaceCountMap)
    .map(([spaceId, taskCount]) => {
      const space = spaceMap.get(spaceId);
      return {
        spaceId,
        spaceName: space?.name ?? spaceId,
        taskCount,
        color: space?.color ?? "#7b68ee",
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount);

  // ── Velocity by week (last 8 weeks) ──────────────────────────────────────
  // Build week buckets for the 8 weeks ending at endMs
  const weekBuckets: Map<string, { weekStart: string; completed: number }> =
    new Map();

  for (let i = 7; i >= 0; i--) {
    const weekAnchor = endMs - i * 7 * 24 * 60 * 60 * 1000;
    const mondayStr = isoWeekMonday(weekAnchor);
    if (!weekBuckets.has(mondayStr)) {
      weekBuckets.set(mondayStr, { weekStart: mondayStr, completed: 0 });
    }
  }

  for (const t of tasks) {
    if (t.status.type !== "done" && t.status.type !== "closed") continue;
    const updatedMs = Number(t.date_updated);
    const mondayStr = isoWeekMonday(updatedMs);
    if (weekBuckets.has(mondayStr)) {
      weekBuckets.get(mondayStr)!.completed++;
    }
  }

  const velocityByWeek = Array.from(weekBuckets.values());

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = buildMetrics(tasks, timeEntries, startMs, endMs);

  return NextResponse.json({
    member,
    tasks: {
      inProgress,
      completed,
      overdue,
      upcoming,
    },
    timeEntries,
    metrics,
    activityHeatmap,
    spaceBreakdown,
    velocityByWeek,
    period: { start: startMs, end: endMs },
  });
}
