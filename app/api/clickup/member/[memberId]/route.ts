import { NextResponse } from "next/server";
import {
  getMe,
  getMembers,
  getSpaces,
  getTasks,
  getTimeEntries,
  type CUTask,
  type CUTimeEntry,
  type CUMemberUser,
} from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

// Suppress unused-import lint warning — getMe is required by the API contract
void (getMe as unknown);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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
  const dayOfWeek = d.getUTCDay(); // 0 = Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + mondayOffset
    )
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
    return NextResponse.json(
      { error: "CLICKUP_TEAM_ID not set" },
      { status: 400 }
    );
  }

  const { memberId } = await params;
  const { searchParams } = new URL(req.url);

  const now = Date.now();

  // Parse start/end as integers — use defaults silently for NaN (never 400)
  const startRaw = parseInt(searchParams.get("start") || "");
  const endRaw = parseInt(searchParams.get("end") || "");
  const startMs = isNaN(startRaw) ? startOfMonth() : startRaw;
  const endMs = isNaN(endRaw) ? now : endRaw;

  // ── Parallel fetches ──────────────────────────────────────────────────────
  // Fetch ALL tasks assigned to this member (no date filters) — bucket client-side
  const [allTasks, members, spaces, timeEntries] = await Promise.all([
    settle(
      getTasks(teamId, {
        include_closed: true,
        "assignees[]": memberId,
      }),
      [] as CUTask[]
    ),
    settle(getMembers(teamId), [] as CUMemberUser[]),
    settle(getSpaces(teamId), []),
    settle(
      getTimeEntries(teamId, startMs, endMs).then((entries) =>
        entries.filter((e) => String(e.user.id) === memberId)
      ),
      [] as CUTimeEntry[]
    ),
  ]);

  // ── Fallback: assignees[] filter may silently return no tasks ────────────
  // If the API ignored the assignees[] param, fetch all tasks and filter manually.
  const resolvedTasks: CUTask[] =
    allTasks.length > 0
      ? allTasks
      : await settle(
          getTasks(teamId, { include_closed: true }).then((all) =>
            all.filter((t) =>
              t.assignees.some((a) => a.id === Number(memberId))
            )
          ),
          [] as CUTask[]
        );

  // ── Resolve member details ────────────────────────────────────────────────
  // assignee.id is a NUMBER; memberId is a STRING — compare with Number()
  const memberUser = members.find((m) => String(m.id) === memberId);

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

  const memberIdNum = Number(memberId);

  /** Check that a task has this member as one of its assignees. */
  const hasAssignee = (t: CUTask): boolean =>
    t.assignees.some((a) => a.id === memberIdNum);

  // ── ACTIVITY — what the person DID during the period ─────────────────────

  /** Tasks completed (date_closed OR date_done) within [startMs, endMs] */
  const completedInPeriod = resolvedTasks.filter((t) => {
    if (!hasAssignee(t)) return false;
    const closedAt = t.date_closed || t.date_done;
    if (!closedAt) return false;
    const closedTs = Number(closedAt);
    return closedTs >= startMs && closedTs <= endMs;
  });

  /** Tasks created (date_created) within [startMs, endMs] */
  const assignedInPeriod = resolvedTasks.filter((t) => {
    if (!hasAssignee(t)) return false;
    const createdTs = Number(t.date_created);
    return createdTs >= startMs && createdTs <= endMs;
  });

  /** Tasks with due_date within [startMs, endMs] */
  const dueInPeriod = resolvedTasks.filter((t) => {
    if (!hasAssignee(t)) return false;
    if (!t.due_date) return false;
    const dueTs = Number(t.due_date);
    return dueTs >= startMs && dueTs <= endMs;
  });

  /** Completed in period where closed_at > due_date (late) */
  const lateCompletions = completedInPeriod.filter((t) => {
    if (!t.due_date) return false;
    const closedAt = t.date_closed || t.date_done;
    if (!closedAt) return false;
    return Number(closedAt) > Number(t.due_date);
  });

  // ── WORKLOAD — state snapshot at end of period ────────────────────────────

  /**
   * Full workload picture:
   *   date_created <= endMs
   *   AND (status.type !== 'closed' OR Number(date_closed||date_done) >= startMs)
   *   AND assignees includes this member
   */
  const allAssigned = resolvedTasks.filter((t) => {
    if (!hasAssignee(t)) return false;
    if (Number(t.date_created) > endMs) return false;
    if (t.status.type === "closed") {
      const closedAt = t.date_closed || t.date_done;
      if (!closedAt) return false;
      return Number(closedAt) >= startMs;
    }
    return true;
  });

  const inProgress = allAssigned.filter((t) => t.status.type === "custom");

  const overdue = allAssigned.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < endMs &&
      t.status.type !== "closed"
  );

  const notStarted = allAssigned.filter((t) => t.status.type === "open");

  const upcoming = allAssigned.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) > endMs &&
      Number(t.due_date) < endMs + 30 * 24 * 3600 * 1000
  );

  // ── METRICS ───────────────────────────────────────────────────────────────

  const totalAssigned = allAssigned.length;
  const completedCount = completedInPeriod.length;
  const inProgressCount = inProgress.length;
  const notStartedCount = notStarted.length;
  const overdueCount = overdue.length;

  const completionRate =
    (completedCount /
      Math.max(dueInPeriod.length || allAssigned.length, 1)) *
    100;

  const onTimeRate =
    ((dueInPeriod.length - lateCompletions.length) /
      Math.max(dueInPeriod.length, 1)) *
    100;

  const hoursLogged =
    timeEntries.reduce((sum, e) => sum + e.duration, 0) / 3_600_000;

  const score = Math.round(
    completionRate * 0.4 +
      onTimeRate * 0.3 +
      (inProgressCount > 0 ? 20 : 0) +
      Math.min(10, allAssigned.length)
  );

  // ── ANALYTICS — all-time, not period-filtered ─────────────────────────────

  /** Activity heatmap: group ALL member tasks by date_updated date */
  const activityHeatmap: Record<string, number> = {};
  for (const t of resolvedTasks) {
    if (!hasAssignee(t)) continue;
    const dateKey = new Date(Number(t.date_updated))
      .toISOString()
      .split("T")[0];
    activityHeatmap[dateKey] = (activityHeatmap[dateKey] ?? 0) + 1;
  }

  /** Space breakdown: group allAssigned tasks by space.id */
  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const spaceCountMap: Record<string, number> = {};
  for (const t of allAssigned) {
    spaceCountMap[t.space.id] = (spaceCountMap[t.space.id] ?? 0) + 1;
  }
  const spaceBreakdown = Object.entries(spaceCountMap)
    .map(([spaceId, taskCount]) => {
      const space = spaceMap.get(spaceId);
      return {
        spaceId,
        spaceName: space?.name ?? spaceId,
        color: space?.color ?? "#7b68ee",
        taskCount,
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount);

  /** Velocity by week: group completedInPeriod by ISO week of date_closed */
  const weekBuckets = new Map<
    string,
    { weekStart: string; completed: number }
  >();
  for (const t of completedInPeriod) {
    const closedAt = t.date_closed || t.date_done;
    if (!closedAt) continue;
    const closedTs = Number(closedAt);
    if (!closedTs) continue;
    const mondayStr = isoWeekMonday(closedTs);
    const bucket = weekBuckets.get(mondayStr);
    if (bucket) {
      bucket.completed++;
    } else {
      weekBuckets.set(mondayStr, { weekStart: mondayStr, completed: 1 });
    }
  }
  const velocityByWeek = Array.from(weekBuckets.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  /** Priority breakdown: count allAssigned by priority */
  const priorityBreakdown = { urgent: 0, high: 0, normal: 0, low: 0, none: 0 };
  for (const t of allAssigned) {
    const p = t.priority?.priority?.toLowerCase() ?? "none";
    if (p === "urgent") priorityBreakdown.urgent++;
    else if (p === "high") priorityBreakdown.high++;
    else if (p === "normal") priorityBreakdown.normal++;
    else if (p === "low") priorityBreakdown.low++;
    else priorityBreakdown.none++;
  }

  // ── Response ──────────────────────────────────────────────────────────────

  return NextResponse.json({
    member,
    activity: {
      completedInPeriod,
      assignedInPeriod,
      dueInPeriod,
      lateCompletions,
    },
    workload: {
      allAssigned,
      inProgress,
      overdue,
      notStarted,
      upcoming,
    },
    metrics: {
      totalAssigned,
      completed: completedCount,
      inProgress: inProgressCount,
      notStarted: notStartedCount,
      overdue: overdueCount,
      completionRate,
      onTimeRate,
      hoursLogged,
      score,
    },
    activityHeatmap,
    spaceBreakdown,
    velocityByWeek,
    priorityBreakdown,
    period: { start: startMs, end: endMs },
  });
}
