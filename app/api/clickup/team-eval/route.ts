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
  const [members, allTasks, timeEntries, spaces] = await Promise.all([
    getMembers(teamId),
    getTasks(teamId, { include_closed: true }),
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

    // Score: null if no tasks, otherwise weighted formula
    const score =
      myTasks.length === 0
        ? null
        : Math.min(
            100,
            Math.round(
              completionRate * 0.4 +
                (overdueRate === 0 ? 30 : Math.max(0, 30 - overdueRate)) +
                (inProgress.length > 0 ? 20 : 0) +
                Math.min(10, myTasks.length) // up to 10 bonus for having tasks
            )
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
