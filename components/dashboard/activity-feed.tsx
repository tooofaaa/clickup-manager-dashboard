"use client";
import { formatDistanceToNow } from "date-fns";
import type { CUTask } from "@/lib/clickup-client";

function safeTimeAgo(dateUpdated: string): string {
  const ts = Number(dateUpdated);
  if (!dateUpdated || Number.isNaN(ts) || ts <= 0) return "recently";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "recently";
  }
}

/** Append an 8-bit alpha hex suffix only for valid 6-digit hex colors. */
function hexWithAlpha(color: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : "var(--cu-hover)";
}

export function ActivityFeed({
  tasks,
  isLoading,
}: {
  tasks: CUTask[];
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;
  if (!tasks.length) return (
    <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No recent activity</div>
  );

  return (
    <div className="max-h-96 divide-y divide-cu-border overflow-y-auto">
      {tasks.map(t => {
        const statusColor   = t.status.color || "#87909e";
        const assigneeNames = t.assignees
          .map(a => a.username ?? (a.email?.split("@")[0] || "Unknown"))
          .join(", ");

        return (
          <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: statusColor }}
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
              <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[11px] text-cu-text-tertiary">
                <span
                  className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
                  style={{
                    backgroundColor: hexWithAlpha(statusColor, "22"),
                    color: statusColor,
                  }}
                >
                  {t.status.status}
                </span>
                <span className="shrink-0">·</span>
                <span className="max-w-[120px] truncate" title={t.list.name}>{t.list.name}</span>
                {assigneeNames && (
                  <>
                    <span className="shrink-0">·</span>
                    <span className="max-w-[120px] truncate">{assigneeNames}</span>
                  </>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-cu-text-tertiary">{safeTimeAgo(t.date_updated)}</span>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-cu-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cu-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-cu-hover" />
            <div className="h-2.5 w-1/2 rounded bg-cu-hover" />
          </div>
          <div className="h-2.5 w-12 shrink-0 rounded bg-cu-hover" />
        </div>
      ))}
    </div>
  );
}
