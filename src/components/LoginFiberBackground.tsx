import { useEffect, useRef } from 'react';

interface Point { x: number; y: number }

interface Strand {
  start: Point;
  end: Point;
  wobbleAmp: number;
  wobbleSpeed: number;
  wobblePhase: number;
  width: number;
  alpha: number;
  hueSet: [string, string, string];
  pulses: { speed: number; phase: number; size: number }[];
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  drift: number;
  phase: number;
}

const COLOR_SETS: [string, string, string][] = [
  ['#38bdf8', '#8b5cf6', '#f5c76a'],
  ['#60a5fa', '#a78bfa', '#facc15'],
  ['#22d3ee', '#7c3aed', '#eab976'],
];

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function buildStrands(w: number, h: number, count: number): Strand[] {
  const strands: Strand[] = [];
  const spacing = (w * 1.7) / count;
  for (let i = 0; i < count; i++) {
    const offset = i * spacing - w * 0.35;
    const jitter = (Math.random() - 0.5) * h * 0.12;
    const start = { x: offset, y: -h * 0.12 + jitter };
    const end = { x: offset + w * 1.15, y: h * 1.12 + jitter };
    const pulseCount = 1 + Math.floor(Math.random() * 2);
    strands.push({
      start,
      end,
      wobbleAmp: h * (0.025 + Math.random() * 0.035),
      wobbleSpeed: 0.12 + Math.random() * 0.18,
      wobblePhase: Math.random() * Math.PI * 2,
      width: 1 + Math.random() * 1.4,
      alpha: 0.3 + Math.random() * 0.3,
      hueSet: COLOR_SETS[i % COLOR_SETS.length],
      pulses: Array.from({ length: pulseCount }, () => ({
        speed: 0.15 + Math.random() * 0.22,
        phase: Math.random(),
        size: 2 + Math.random() * 1.6,
      })),
    });
  }
  return strands;
}

function buildBokeh(w: number, h: number, count: number): Bokeh[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 20 + Math.random() * 46,
    baseAlpha: 0.03 + Math.random() * 0.05,
    drift: 3 + Math.random() * 6,
    phase: Math.random() * Math.PI * 2,
  }));
}

function hexToRgb(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
}

export default function LoginFiberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;
    let strands: Strand[] = [];
    let bokeh: Bokeh[] = [];
    let w = 0, h = 0, dpr = 1;

    const isMobile = () => window.innerWidth < 640;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const strandCount = isMobile() ? 5 : 8;
      const bokehCount = isMobile() ? 8 : 16;
      strands = buildStrands(w, h, strandCount);
      bokeh = buildBokeh(w, h, bokehCount);
    };

    const drawFrame = (time: number, motionScale: number) => {
      ctx.clearRect(0, 0, w, h);

      for (const b of bokeh) {
        const alpha = b.baseAlpha * (0.6 + 0.4 * Math.sin(time * 0.0004 + b.phase));
        const y = ((b.y - time * 0.006 * b.drift * motionScale) % (h + b.r * 2) + (h + b.r * 2)) % (h + b.r * 2) - b.r;
        const grad = ctx.createRadialGradient(b.x, y, 0, b.x, y, b.r);
        grad.addColorStop(0, `rgba(139,92,246,${alpha})`);
        grad.addColorStop(1, 'rgba(139,92,246,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const s of strands) {
        const dx = s.end.x - s.start.x, dy = s.end.y - s.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const wob = Math.sin(time * 0.0006 * s.wobbleSpeed + s.wobblePhase) * s.wobbleAmp * motionScale;
        const c1 = { x: s.start.x + dx * 0.33 + nx * wob, y: s.start.y + dy * 0.33 + ny * wob };
        const c2 = { x: s.start.x + dx * 0.66 - nx * wob * 0.6, y: s.start.y + dy * 0.66 - ny * wob * 0.6 };

        const grad = ctx.createLinearGradient(s.start.x, s.start.y, s.end.x, s.end.y);
        grad.addColorStop(0, `rgba(${hexToRgb(s.hueSet[0])},${s.alpha})`);
        grad.addColorStop(0.5, `rgba(${hexToRgb(s.hueSet[1])},${s.alpha})`);
        grad.addColorStop(1, `rgba(${hexToRgb(s.hueSet[2])},${s.alpha * 0.85})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.shadowColor = s.hueSet[1];
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(s.start.x, s.start.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, s.end.x, s.end.y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (const p of s.pulses) {
          const t = (((time / 1000) * p.speed * motionScale + p.phase) % 1 + 1) % 1;
          const pt = cubicPoint(s.start, c1, c2, s.end, t);
          ctx.beginPath();
          ctx.fillStyle = '#fff8e7';
          ctx.shadowColor = s.hueSet[2];
          ctx.shadowBlur = 14;
          ctx.arc(pt.x, pt.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };

    resize();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    };
    window.addEventListener('resize', onResize);

    let visible = document.visibilityState === 'visible';
    const onVisibility = () => { visible = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onVisibility);

    const loop = (time: number) => {
      if (visible) drawFrame(time, 1);
      rafId = requestAnimationFrame(loop);
    };

    const renderStaticFrame = () => drawFrame(0, 0);

    let stopAnimation: (() => void) | null = null;
    const startAnimation = () => { rafId = requestAnimationFrame(loop); stopAnimation = () => cancelAnimationFrame(rafId); };

    const applyMotionPreference = () => {
      if (stopAnimation) { stopAnimation(); stopAnimation = null; }
      if (reduceMotionQuery.matches) renderStaticFrame();
      else startAnimation();
    };

    applyMotionPreference();
    reduceMotionQuery.addEventListener('change', applyMotionPreference);

    return () => {
      if (stopAnimation) stopAnimation();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotionQuery.removeEventListener('change', applyMotionPreference);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,_#0c1330_0%,_#060814_65%,_#03040a_100%)]">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
