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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Safely settle a promise and return its value or a fallback. */
async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[member] partial fetch failed:", err);
    return fallback;
  }
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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

  // Parse start/end — default to current month
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  const startMs = startRaw ? Number(startRaw) : startOfMonth();
  const endMs = endRaw ? Number(endRaw) : now;

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

  // ── Resolve member details — 404 if not found ─────────────────────────────
  const teamMember = teamData.members.find(
    (m) => String(m.user.id) === memberId
  );

  if (!teamMember) {
    return NextResponse.json(
      { error: `Member ${memberId} not found in team ${teamId}` },
      { status: 404 }
    );
  }

  const memberUser: CUMemberUser = teamMember.user;
  const member = {
    id: memberUser.id,
    username: memberUser.username,
    email: memberUser.email,
    color: memberUser.color,
    profilePicture: memberUser.profilePicture,
    initials: memberUser.initials,
  };

  // ── Task buckets ──────────────────────────────────────────────────────────
  // Status types confirmed: "open" | "custom" | "closed"
  const inProgress = tasks.filter((t) => t.status.type === "custom");
  const completed = tasks.filter((t) => t.status.type === "closed");
  const notStarted = tasks.filter((t) => t.status.type === "open");

  const overdue = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "closed"
  );

  const thirtyDaysOut = now + 30 * 24 * 60 * 60 * 1000;
  const upcoming = tasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) > now &&
      Number(t.due_date) < thirtyDaysOut &&
      t.status.type !== "closed"
  );

  // ── Activity heatmap ──────────────────────────────────────────────────────
  // Key: "YYYY-MM-DD", value: count of tasks updated that day
  const activityHeatmap: Record<string, number> = {};
  for (const t of tasks) {
    const dateKey = new Date(Number(t.date_updated)).toISOString().split("T")[0];
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
  const weekBuckets = new Map<string, { weekStart: string; completed: number }>();
  for (let i = 7; i >= 0; i--) {
    const weekAnchor = now - i * 7 * 24 * 60 * 60 * 1000;
    const mondayStr = isoWeekMonday(weekAnchor);
    if (!weekBuckets.has(mondayStr)) {
      weekBuckets.set(mondayStr, { weekStart: mondayStr, completed: 0 });
    }
  }
  for (const t of tasks) {
    if (t.status.type !== "closed") continue;
    const mondayStr = isoWeekMonday(Number(t.date_updated));
    if (weekBuckets.has(mondayStr)) {
      weekBuckets.get(mondayStr)!.completed++;
    }
  }
  const velocityByWeek = Array.from(weekBuckets.values());

  // ── Priority breakdown ────────────────────────────────────────────────────
  const priorityBreakdown: Record<string, number> = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
    none: 0,
  };
  for (const t of tasks) {
    const p = t.priority?.priority?.toLowerCase() ?? "none";
    if (p in priorityBreakdown) {
      priorityBreakdown[p]++;
    } else {
      priorityBreakdown.none++;
    }
  }

  // ── Metrics — same shape as team-eval route ───────────────────────────────
  const totalTasks = tasks.length;
  const completedCount = completed.length;
  const overdueCount = overdue.length;
  const inProgressCount = inProgress.length;

  const completionRate =
    totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const overdueRate =
    totalTasks > 0 ? Math.round((overdueCount / totalTasks) * 100) : 0;

  const onTime = completed.filter(
    (t) => t.due_date && Number(t.date_updated) <= Number(t.due_date)
  );
  const completedWithDueDate = completed.filter((t) => !!t.due_date);
  const onTimeRate =
    completedWithDueDate.length > 0
      ? Math.round((onTime.length / completedWithDueDate.length) * 100)
      : 0;

  // Activity rate: tasks updated within the period
  const activeCount = tasks.filter(
    (t) =>
      Number(t.date_updated) >= startMs && Number(t.date_updated) <= endMs
  ).length;
  const activityRate =
    totalTasks > 0 ? Math.round((activeCount / totalTasks) * 100) : 0;

  // Hours logged from time entries
  const totalTimeMs = timeEntries.reduce((sum, e) => sum + e.duration, 0);
  const hoursLogged = Math.round((totalTimeMs / 3_600_000) * 10) / 10;

  // Average task age for open/in-progress tasks (days)
  const openTasks = tasks.filter((t) => t.status.type !== "closed");
  const avgTaskAge =
    openTasks.length > 0
      ? Math.round(
          (openTasks.reduce(
            (sum, t) => sum + (now - Number(t.date_created)),
            0
          ) /
            openTasks.length /
            86_400_000) *
            10
        ) / 10
      : 0;

  // Spaces worked in
  const spacesWorkedIn = [...new Set(tasks.map((t) => t.space.id))];

  // Trend: compare completions in second half vs first half of period
  const midMs = startMs + (endMs - startMs) / 2;
  const periodCompleted = completed.filter(
    (t) =>
      Number(t.date_updated) >= startMs &&
      Number(t.date_updated) <= endMs
  );
  const firstHalf = periodCompleted.filter(
    (t) => Number(t.date_updated) < midMs
  ).length;
  const secondHalf = periodCompleted.filter(
    (t) => Number(t.date_updated) >= midMs
  ).length;
  const trend: "up" | "down" | "stable" =
    secondHalf > firstHalf ? "up" : secondHalf < firstHalf ? "down" : "stable";

  // Score (same weights as team-eval; uses (100 - overdueRate) in place of workloadScore)
  const score = Math.round(
    completionRate * 0.3 +
      onTimeRate * 0.3 +
      activityRate * 0.2 +
      (100 - overdueRate) * 0.2
  );

  const metrics = {
    score,
    completionRate,
    overdueRate,
    onTimeRate,
    activityRate,
    assigned: totalTasks,
    completed: completedCount,
    overdue: overdueCount,
    inProgress: inProgressCount,
    notStarted: notStarted.length,
    hoursLogged,
    avgTaskAge,
    spacesWorkedIn,
    priorityBreakdown,
    trend,
  };

  return NextResponse.json({
    member,
    tasks: {
      inProgress,
      completed,
      notStarted,
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
