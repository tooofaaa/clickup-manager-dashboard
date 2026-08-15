"use client";

export type ScoreBadgeSize = "sm" | "md" | "lg";

interface ScoreBadgeProps {
  score: number;
  size?: ScoreBadgeSize;
  className?: string;
}

const SIZE_CONFIG: Record<ScoreBadgeSize, { outer: number; inner: number; font: number; ring: number }> = {
  sm: { outer: 36, inner: 28, font: 10, ring: 3 },
  md: { outer: 52, inner: 42, font: 14, ring: 4 },
  lg: { outer: 72, inner: 58, font: 20, ring: 5 },
};

function getColor(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export function ScoreBadge({ score, size = "md", className = "" }: ScoreBadgeProps) {
  const cfg = SIZE_CONFIG[size];
  const color = getColor(score);
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <div
      className={className}
      style={{
        width: cfg.outer,
        height: cfg.outer,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cu-panel)",
        boxShadow: `0 0 0 ${cfg.ring}px ${color}33, 0 0 0 ${cfg.ring + 1}px ${color}`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: cfg.inner,
          height: cfg.inner,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${color}1a`,
          color,
          fontWeight: 700,
          fontSize: cfg.font,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {clampedScore}
      </div>
    </div>
  );
}

export function ScoreBadgeSkeleton({ size = "md" }: { size?: ScoreBadgeSize }) {
  const cfg = SIZE_CONFIG[size];
  return (
    <div
      style={{
        width: cfg.outer,
        height: cfg.outer,
        borderRadius: "50%",
        background: "var(--cu-hover)",
        animation: "pulse 1.5s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}
