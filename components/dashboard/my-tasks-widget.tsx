"use client";
import { formatDistanceToNow } from "date-fns";
import type { CUTask, CUUser } from "@/lib/clickup-client";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#f50000",
  high:   "#ffcc00",
  normal: "#6fa1ff",
  low:    "#b5bcc9",
};

function safeDueStr(dueDateStr: string | null): string | null {
  if (!dueDateStr) return null;
  const ts = Number(dueDateStr);
  if (Number.isNaN(ts) || ts <= 0) return null;
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return null;
  }
}

export function MyTasksWidget({
  tasks,
  currentUser,
  isLoading,
}: {
  tasks: CUTask[];
  currentUser: CUUser | null;
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;

  if (!currentUser) {
    return (
      <div className="flex h-24 items-center justify-center text-[13px] text-cu-text-tertiary">
        Sign in to see your tasks
      </div>
    );
  }

  // Deduplicate by task id (multi-assignee tasks appear once per assignee in flatMap)
  const seen = new Set<string>();
  const mine = tasks
    .filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return t.assignees.some(a => a.id === currentUser.id);
    })
    .filter(t => t.status.type !== "done" && t.status.type !== "closed")
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return Number(a.due_date) - Number(b.due_date);
    })
    .slice(0, 15);

  if (!mine.length) return (
    <div className="flex h-24 items-center justify-center text-[13px] text-cu-text-tertiary">
      No open tasks assigned to you
    </div>
  );

  return (
    <div className="max-h-96 divide-y divide-cu-border overflow-y-auto">
      {mine.map(t => {
        const overdue       = t.due_date ? Number(t.due_date) < Date.now() : false;
        const dueStr        = safeDueStr(t.due_date);
        const priorityColor = t.priority
          ? (PRIORITY_COLORS[t.priority.priority] ?? t.priority.color)
          : null;

        return (
          <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: t.status.color ?? "#87909e" }}
            />
            <div className="min-w-0 flex-1">
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline"
              >
                {t.name}
              </a>
              <div className="mt-0.5 flex items-center gap-1.5">
                {priorityColor && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: priorityColor }}
                    title={t.priority?.priority ?? ""}
                  />
                )}
                <span className="truncate text-[11px] text-cu-text-tertiary">{t.list.name}</span>
              </div>
            </div>
            {dueStr && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={
                  overdue
                    ? { backgroundColor: "color-mix(in srgb, #f50000 12%, var(--cu-panel))", color: "#f50000" }
                    : { backgroundColor: "var(--cu-hover)", color: "var(--cu-text-secondary)" }
                }
              >
                {dueStr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-cu-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cu-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-cu-hover" />
            <div className="h-2.5 w-1/3 rounded bg-cu-hover" />
          </div>
          <div className="h-5 w-16 shrink-0 rounded bg-cu-hover" />
        </div>
      ))}
    </div>
  );
}
