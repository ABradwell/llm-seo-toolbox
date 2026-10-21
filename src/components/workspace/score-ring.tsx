import { scoreTone, toneColor } from "@/lib/score";
import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 132,
  strokeWidth = 7,
  gradeLabel,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  gradeLabel?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone = scoreTone(clamped);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(250,250,250,0.09)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={toneColor(tone)}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono tracking-tight" style={{ fontSize: size * 0.27, lineHeight: 1 }}>
          {clamped}
        </span>
        {gradeLabel ? (
          <span className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted uppercase">
            {gradeLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
