import { NextRequest, NextResponse } from "next/server";
import {
  getMembers,
  getTasks,
  getTimeEntries,
  type CUMemberUser,
  type CUTask,
  type CUTimeEntry,
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

interface PriorityBreakdown {
  urgent: number;
  high: number;
  normal: number;
  low: number;
}

interface MemberMetrics {
  score: number;
  completionRate: number;
  onTimeRate: number;
  activityRate: number;
  assigned: number;
  completed: number;
  overdue: number;
  inProgress: number;
  hoursLogged: number;
  avgTaskAge: number;
  spacesWorkedIn: string[];
  priorityBreakdown: PriorityBreakdown;
  trend: "up" | "down" | "stable";
}

interface EvalResult {
  member: {
    id: number;
    username: string | null;
    email: string;
    color: string | null;
    profilePicture: string | null;
    initials: string;
  };
  metrics: MemberMetrics;
  period: { start: number; end: number };
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

  // Parse query params
  const { searchParams } = req.nextUrl;
  const startMs = parseTimestamp(searchParams.get("start"), startOfMonth());
  const endMs = parseTimestamp(searchParams.get("end"), now);

  // 1. Fetch members, tasks, and time entries in parallel
  const [members, allTasks, timeEntries] = await Promise.all([
    getMembers(teamId),
    fetchAllTasks(teamId),
    getTimeEntries(teamId, startMs, endMs),
  ]);

  // Pre-index time entries by user id
  const timeByUser = buildTimeIndex(timeEntries);

  // Average team load: tasks per member (within period)
  const periodTasks = allTasks.filter((t) => isInPeriod(t, startMs));
  const avgTeamLoad =
    members.length > 0 ? periodTasks.length / members.length : 0;

  // Half-period midpoint for trend comparison
  const midMs = startMs + (endMs - startMs) / 2;

  const results: EvalResult[] = members.map((member) => {
    const assigned = periodTasks.filter((t) =>
      t.assignees.some((a) => a.id === member.id)
    );

    const completed = assigned.filter(
      (t) =>
        (t.status.type === "done" || t.status.type === "closed") &&
        Number(t.date_updated) >= startMs &&
        Number(t.date_updated) <= endMs
    );

    const overdue = assigned.filter(
      (t) =>
        t.due_date &&
        Number(t.due_date) < now &&
        t.status.type !== "done" &&
        t.status.type !== "closed"
    );

    const inProgress = assigned.filter(
      (t) =>
        t.status.type !== "done" &&
        t.status.type !== "closed" &&
        (t.status.type === "active" ||
          (t.status.type !== "open" &&
            t.status.type !== "not_started" &&
            t.status.type !== "waiting"))
    );

    const onTime = completed.filter(
      (t) =>
        t.due_date &&
        Number(t.date_updated) <= Number(t.due_date)
    );

    const completedWithDueDate = completed.filter((t) => !!t.due_date);

    const completionRate =
      (completed.length / Math.max(assigned.length, 1)) * 100;
    const onTimeRate =
      (onTime.length / Math.max(completedWithDueDate.length, 1)) * 100;

    // Activity: tasks updated within the period
    const activeCount = assigned.filter(
      (t) => Number(t.date_updated) >= startMs
    ).length;
    const activityRate = (activeCount / Math.max(assigned.length, 1)) * 100;

    // Hours logged from time entries
    const userEntries = timeByUser.get(member.id) ?? [];
    const hoursLogged =
      userEntries.reduce((sum, e) => sum + (e.duration ?? 0), 0) / 3_600_000;

    // Average task age for open tasks (in days)
    const openTasks = assigned.filter(
      (t) => t.status.type !== "done" && t.status.type !== "closed"
    );
    const avgTaskAge =
      openTasks.length > 0
        ? openTasks.reduce(
            (sum, t) => sum + (now - Number(t.date_created)),
            0
          ) /
          openTasks.length /
          86_400_000
        : 0;

    // Spaces worked in
    const spacesWorkedIn = [
      ...new Set(assigned.map((t) => t.space.id)),
    ];

    // Priority breakdown
    const priorityBreakdown: PriorityBreakdown = { urgent: 0, high: 0, normal: 0, low: 0 };
    for (const t of assigned) {
      const p = t.priority?.priority?.toLowerCase() ?? "normal";
      if (p === "urgent") priorityBreakdown.urgent++;
      else if (p === "high") priorityBreakdown.high++;
      else if (p === "low") priorityBreakdown.low++;
      else priorityBreakdown.normal++;
    }

    // Workload score
    const workloadScore =
      assigned.length === 0
        ? 50
        : Math.min(
            100,
            100 -
              (Math.abs(assigned.length - avgTeamLoad) /
                Math.max(avgTeamLoad, 1)) *
                100
          );

    const score = Math.round(
      completionRate * 0.3 +
        onTimeRate * 0.3 +
        activityRate * 0.2 +
        workloadScore * 0.2
    );

    // Trend: compare completed tasks in second half vs first half of period
    const firstHalfCompleted = completed.filter(
      (t) => Number(t.date_updated) < midMs
    ).length;
    const secondHalfCompleted = completed.filter(
      (t) => Number(t.date_updated) >= midMs
    ).length;
    const trend: "up" | "down" | "stable" =
      secondHalfCompleted > firstHalfCompleted
        ? "up"
        : secondHalfCompleted < firstHalfCompleted
        ? "down"
        : "stable";

    return {
      member: {
        id: member.id,
        username: member.username ?? null,
        email: member.email,
        color: member.color ?? null,
        profilePicture: member.profilePicture ?? null,
        initials: member.initials,
      },
      metrics: {
        score,
        completionRate,
        onTimeRate,
        activityRate,
        assigned: assigned.length,
        completed: completed.length,
        overdue: overdue.length,
        inProgress: inProgress.length,
        hoursLogged,
        avgTaskAge,
        spacesWorkedIn,
        priorityBreakdown,
        trend,
      },
      period: { start: startMs, end: endMs },
    };
  });

  // Sort by score descending
  results.sort((a, b) => b.metrics.score - a.metrics.score);

  return NextResponse.json(results);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch all task pages with include_closed and subtasks=false */
async function fetchAllTasks(teamId: string): Promise<CUTask[]> {
  return getTasks(teamId, {
    include_closed: "true",
    subtasks: "false",
    order_by: "updated",
    reverse: "true",
  });
}

/** Returns true when a task falls within the period by date_updated or date_created */
function isInPeriod(task: CUTask, startMs: number): boolean {
  const updated = Number(task.date_updated);
  const created = Number(task.date_created);
  return updated >= startMs || created >= startMs;
}

/** Build a Map<userId, CUTimeEntry[]> from a flat array of time entries */
function buildTimeIndex(entries: CUTimeEntry[]): Map<number, CUTimeEntry[]> {
  const map = new Map<number, CUTimeEntry[]>();
  for (const entry of entries) {
    const uid = entry.user?.id;
    if (uid == null) continue;
    const list = map.get(uid) ?? [];
    list.push(entry);
    map.set(uid, list);
  }
  return map;
}
