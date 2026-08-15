"use client";
import { formatDistanceToNow } from "date-fns";
import type { CUTask, CUMember } from "@/lib/clickup-client";

export function MyTasksWidget({ tasks, currentUser }: { tasks: CUTask[]; currentUser: CUMember | null }) {
  const mine = (currentUser ? tasks.filter(t => t.assignees.some(a => a.id === currentUser.id)) : tasks)
    .filter(t => t.status.type !== "done" && t.status.type !== "closed").slice(0, 15);

  if (!mine.length) return <div className="flex h-24 items-center justify-center text-[13px] text-cu-text-tertiary">No open tasks assigned to you</div>;
  return (
    <div className="divide-y divide-cu-border">
      {mine.map(t => {
        const overdue = t.due_date && Number(t.due_date) < Date.now();
        return (
          <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.status.color ?? "#87909e" }} />
            <div className="min-w-0 flex-1">
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline">{t.name}</a>
              <span className="text-[11px] text-cu-text-tertiary">{t.list.name}</span>
            </div>
            {t.due_date && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${overdue ? "bg-[#fff0f0] text-[#f50000]" : "bg-cu-hover text-cu-text-secondary"}`}>
                {formatDistanceToNow(new Date(Number(t.due_date)), { addSuffix: true })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
