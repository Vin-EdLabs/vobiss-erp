import React from 'react';

function toneColor(pct: number) {
  if (pct >= 90) return 'var(--accent-red)';
  if (pct >= 75) return 'var(--accent-amber)';
  if (pct >= 50) return 'var(--accent-amber)';
  return 'var(--accent-green)';
}

export function CircularProgress({
  value,
  size = 128,
  strokeWidth = 10,
  label,
  sublabel,
}: {
  /** 0-100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = toneColor(pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-secondary)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label !== undefined ? (
          label
        ) : (
          <span className="text-2xl font-bold text-[var(--text-primary)]">{Math.round(pct)}%</span>
        )}
        {sublabel && <span className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">{sublabel}</span>}
      </div>
    </div>
  );
}
