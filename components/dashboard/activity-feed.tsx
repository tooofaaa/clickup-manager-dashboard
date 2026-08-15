"use client";
import { formatDistanceToNow } from "date-fns";
import type { CUTask } from "@/lib/clickup-client";

export function ActivityFeed({ tasks }: { tasks: CUTask[] }) {
  if (!tasks.length) return <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No recent activity</div>;
  return (
    <div className="divide-y divide-cu-border">
      {tasks.map(t => (
        <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.status.color ?? "#87909e" }} />
          <div className="min-w-0 flex-1">
            <a href={t.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline">{t.name}</a>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-cu-text-tertiary">
              <span className="rounded px-1.5 py-px text-[10px] font-medium" style={{ backgroundColor: `${t.status.color}22`, color: t.status.color }}>{t.status.status}</span>
              <span>·</span><span>{t.list.name}</span>
              {t.assignees.length > 0 && <><span>·</span><span>{t.assignees.map(a => a.username ?? a.email.split("@")[0]).join(", ")}</span></>}
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-cu-text-tertiary">{formatDistanceToNow(new Date(Number(t.date_updated)), { addSuffix: true })}</span>
        </div>
      ))}
    </div>
  );
}
