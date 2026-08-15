"use client";

interface SpaceBreakdownItem {
  spaceId: string;
  spaceName: string;
  taskCount: number;
  color: string;
}

interface SpaceBreakdownBarProps {
  data: SpaceBreakdownItem[];
  isLoading?: boolean;
}

export function SpaceBreakdownBar({ data, isLoading }: SpaceBreakdownBarProps) {
  if (isLoading) return <SpaceBreakdownSkeleton />;

  if (!data.length) {
    return (
      <div
        style={{
          padding: "24px 0",
          textAlign: "center",
          color: "var(--cu-text-tertiary)",
          fontSize: 13,
        }}
      >
        No space data available
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.taskCount - a.taskCount);
  const max = sorted[0]?.taskCount ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map((item) => {
        const pct = max > 0 ? (item.taskCount / max) * 100 : 0;
        return (
          <div key={item.spaceId} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--cu-text)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                  title={item.spaceName}
                >
                  {item.spaceName}
                </span>
              </div>
              <span
                style={{
                  color: "var(--cu-text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                {item.taskCount}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--cu-hover)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: 3,
                  background: item.color,
                  transition: "width 0.4s ease",
                  minWidth: pct > 0 ? 4 : 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SpaceBreakdownSkeleton() {
  const widths = [100, 78, 55, 42, 30];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {widths.map((w, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div
              style={{
                height: 12,
                width: `${w * 0.9}px`,
                borderRadius: 4,
                background: "var(--cu-hover)",
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 60}ms`,
              }}
            />
            <div
              style={{
                height: 12,
                width: 24,
                borderRadius: 4,
                background: "var(--cu-hover)",
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 60 + 30}ms`,
              }}
            />
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--cu-hover)",
              overflow: "hidden",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 60}ms`,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${w}%`,
                background: "var(--cu-hover-strong)",
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
