import { NextRequest, NextResponse } from "next/server";
import {
  getMembers,
  getTasks,
  getTimeEntries,
  getSpaces,
} from "@/lib/clickup-client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!isNaN(n) && n > 0) return n;
  const d = Date.parse(value);
  return isNaN(d) ? fallback : d;
}

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) {
    return NextResponse.json(
      { error: "CLICKUP_TEAM_ID env var is not set" },
      { status: 500 }
    );
  }

  const now = Date.now();

  // 1. Parse query params
  const { searchParams } = req.nextUrl;
  const startMs = parseTimestamp(searchParams.get("start"), startOfMonth());
  const endMs = parseTimestamp(searchParams.get("end"), now);

  // 2. Fetch in parallel
  // Pass date_updated_gt/lt so getTasks honours the selected period (ISSUE 1)
  const [members, allTasks, timeEntries, spaces] = await Promise.all([
    getMembers(teamId),
    getTasks(teamId, {
      include_closed: true,
      date_updated_gt: startMs,
      date_updated_lt: endMs,
    }),
    getTimeEntries(teamId, startMs, endMs),
    getSpaces(teamId),
  ]);

  // Build time-logged index by user id (number)
  const timeByUser = new Map<number, number>();
  for (const entry of timeEntries) {
    const uid = entry.user?.id;
    if (uid == null) continue;
    timeByUser.set(uid, (timeByUser.get(uid) ?? 0) + (entry.duration ?? 0));
  }

  // 3. Compute per-member metrics
  // CRITICAL: assignee.id is a NUMBER, member.id is a NUMBER
  const memberResults = members.map((member) => {
    const myTasks = allTasks.filter((t) =>
      t.assignees.some((a) => a.id === member.id)
    );

    const completed = myTasks.filter((t) => t.status.type === "closed");
    const inProgress = myTasks.filter((t) => t.status.type === "custom");
    const notStarted = myTasks.filter((t) => t.status.type === "open");
    const overdue = myTasks.filter(
      (t) =>
        t.due_date &&
        Number(t.due_date) < now &&
        t.status.type !== "closed"
    );

    const completionRate =
      myTasks.length > 0
        ? Math.round((completed.length / myTasks.length) * 100)
        : 0;
    const overdueRate =
      myTasks.length > 0
        ? Math.round((overdue.length / myTasks.length) * 100)
        : 0;

    // On-time rate: use date_done ?? date_closed (not date_updated) to avoid
    // false "late" results caused by post-closure edits (ISSUE 3 / ISSUE 10)
    const completedWithDueDate = completed.filter((t) => !!t.due_date);
    const onTimeCompleted = completedWithDueDate.filter((t) => {
      const completedAt = Number(t.date_done ?? t.date_closed);
      return completedAt > 0 && completedAt <= Number(t.due_date);
    });
    const onTimeRate =
      completedWithDueDate.length > 0
        ? Math.round((onTimeCompleted.length / completedWithDueDate.length) * 100)
        : 0;

    // Activity rate: tasks that were updated within the selected period
    const activeCount = myTasks.filter(
      (t) =>
        Number(t.date_updated) >= startMs && Number(t.date_updated) <= endMs
    ).length;
    const activityRate =
      myTasks.length > 0
        ? Math.round((activeCount / myTasks.length) * 100)
        : 0;

    // Score: null if no tasks; otherwise use same formula as member route (ISSUE 10)
    const score =
      myTasks.length === 0
        ? null
        : Math.round(
            completionRate * 0.3 +
              onTimeRate * 0.3 +
              activityRate * 0.2 +
              (100 - overdueRate) * 0.2
          );

    const hoursLogged = (timeByUser.get(member.id) ?? 0) / 3_600_000;

    return {
      member: {
        id: String(member.id),
        username: member.username ?? null,
        email: member.email,
        color: member.color ?? null,
        profilePicture: member.profilePicture ?? null,
        initials: member.initials,
      },
      taskCount: myTasks.length,
      metrics: {
        score,
        completionRate,
        overdueRate,
        completed: completed.length,
        inProgress: inProgress.length,
        notStarted: notStarted.length,
        overdue: overdue.length,
        hoursLogged,
      },
    };
  });

  // 5. Sort: members with tasks first (by taskCount desc), then alphabetically
  memberResults.sort((a, b) => {
    if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount;
    const nameA = (a.member.username ?? a.member.email).toLowerCase();
    const nameB = (b.member.username ?? b.member.email).toLowerCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });

  // 4. Compute team insights
  const unassigned = allTasks.filter((t) => t.assignees.length === 0);
  const allOverdue = allTasks.filter(
    (t) =>
      t.due_date &&
      Number(t.due_date) < now &&
      t.status.type !== "closed"
  );

  const tasksByStatus: Record<string, number> = { open: 0, custom: 0, closed: 0 };
  for (const task of allTasks) {
    tasksByStatus[task.status.type] =
      (tasksByStatus[task.status.type] ?? 0) + 1;
  }

  // Space health
  const tasksBySpace = spaces
    .map((s) => {
      const st = allTasks.filter((t) => t.space.id === s.id);
      const closedCount = st.filter((t) => t.status.type === "closed").length;
      const overdueCount = st.filter(
        (t) =>
          t.due_date &&
          Number(t.due_date) < now &&
          t.status.type !== "closed"
      ).length;
      return {
        spaceId: s.id,
        spaceName: s.name,
        color: s.color ?? "#7b68ee",
        total: st.length,
        closed: closedCount,
        overdue: overdueCount,
        pct:
          st.length > 0
            ? Math.round((closedCount / st.length) * 100)
            : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const membersWithTasks = memberResults.filter((m) => m.taskCount > 0).length;
  const membersWithoutTasks = memberResults.filter(
    (m) => m.taskCount === 0
  ).length;

  return NextResponse.json({
    members: memberResults,
    insights: {
      totalTasks: allTasks.length,
      unassignedTasks: unassigned.length,
      overdueTotal: allOverdue.length,
      tasksByStatus,
      tasksBySpace,
      membersWithTasks,
      membersWithoutTasks,
    },
    period: { start: startMs, end: endMs },
  });
}
