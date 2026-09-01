import { useEffect, useRef } from 'react';

interface Point { x: number; y: number }

interface FiberStrand {
  slot: number; // -1..1 position within the bundle cross-section
  color: string;
  pulseSpeed: number;
  pulsePhase: number;
  pulseSize: number;
  widthJitter: number;
}

type FanAt = 'start' | 'end' | 'both';

interface CableBundle {
  start: Point;
  end: Point;
  bundleRadius: number; // half-width when tightly jacketed
  fanSpread: number; // half-width once the fibers fan out
  fanAt: FanAt;
  wobbleAmp: number;
  wobbleSpeed: number;
  wobblePhase: number;
  strands: FiberStrand[];
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  drift: number;
  phase: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  speed: number;
  phase: number;
  drift: number;
}

// Blue, cyan, purple, magenta, green, yellow — the individual-fiber palette real multi-core
// optical cables show once you look inside the jacket.
const FIBER_COLORS = ['#38bdf8', '#22d3ee', '#a78bfa', '#e879f9', '#34d399', '#facc15'];
const SHEATH_COLOR = '30,41,59'; // slate-800 — the cable jacket

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 0 = tightly jacketed, 1 = fully fanned out into bare individual fibers. */
function fanFactor(fanAt: FanAt, t: number): number {
  let fan = 0;
  if (fanAt === 'end' || fanAt === 'both') fan = Math.max(fan, smoothstep(0.74, 1, t));
  if (fanAt === 'start' || fanAt === 'both') fan = Math.max(fan, 1 - smoothstep(0, 0.26, t));
  return fan;
}

function buildBundles(w: number, h: number, count: number): CableBundle[] {
  const bundles: CableBundle[] = [];
  const spacing = (w * 1.6) / count;
  for (let i = 0; i < count; i++) {
    const offset = i * spacing - w * 0.3 + (Math.random() - 0.5) * spacing * 0.35;
    const jitter = (Math.random() - 0.5) * h * 0.1;
    const start = { x: offset, y: -h * 0.15 + jitter };
    const end = { x: offset + w * (0.7 + Math.random() * 0.5), y: h * 1.15 + jitter };
    const strandCount = 6 + Math.floor(Math.random() * 3);
    const colorStart = Math.floor(Math.random() * FIBER_COLORS.length);
    const strands: FiberStrand[] = Array.from({ length: strandCount }, (_, si) => ({
      slot: strandCount > 1 ? (si / (strandCount - 1)) * 2 - 1 : 0,
      color: FIBER_COLORS[(colorStart + si) % FIBER_COLORS.length],
      pulseSpeed: 0.07 + Math.random() * 0.09,
      pulsePhase: Math.random(),
      pulseSize: 1.7 + Math.random() * 1.3,
      widthJitter: 0.75 + Math.random() * 0.55,
    }));
    const fanRoll = Math.random();
    bundles.push({
      start,
      end,
      bundleRadius: 3.5 + Math.random() * 1.5,
      fanSpread: 17 + Math.random() * 11,
      fanAt: fanRoll < 0.45 ? 'end' : fanRoll < 0.8 ? 'start' : 'both',
      wobbleAmp: h * (0.01 + Math.random() * 0.014),
      wobbleSpeed: 0.05 + Math.random() * 0.07,
      wobblePhase: Math.random() * Math.PI * 2,
      strands,
    });
  }
  return bundles;
}

function buildBokeh(w: number, h: number, count: number): Bokeh[] {
  const colors = ['139,92,246', '56,189,248'];
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 26 + Math.random() * 48,
    baseAlpha: 0.025 + Math.random() * 0.04,
    drift: 3 + Math.random() * 4,
    phase: Math.random() * Math.PI * 2,
    color: colors[i % colors.length],
  }));
}

function buildParticles(w: number, h: number, count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.6 + Math.random() * 1,
    baseAlpha: 0.2 + Math.random() * 0.3,
    speed: 1.5 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
    drift: (Math.random() - 0.5) * 7,
  }));
}

const SAMPLES = 26;

export default function LoginFiberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;
    let bundles: CableBundle[] = [];
    let bokeh: Bokeh[] = [];
    let particles: Particle[] = [];
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
      bundles = buildBundles(w, h, isMobile() ? 3 : 4);
      bokeh = buildBokeh(w, h, isMobile() ? 6 : 12);
      particles = buildParticles(w, h, isMobile() ? 10 : 22);
    };

    const drawFrame = (time: number, motionScale: number) => {
      ctx.clearRect(0, 0, w, h);

      for (const b of bokeh) {
        const alpha = b.baseAlpha * (0.6 + 0.4 * Math.sin(time * 0.0004 + b.phase));
        const y = ((b.y - time * 0.006 * b.drift * motionScale) % (h + b.r * 2) + (h + b.r * 2)) % (h + b.r * 2) - b.r;
        const grad = ctx.createRadialGradient(b.x, y, 0, b.x, y, b.r);
        grad.addColorStop(0, `rgba(${b.color},${alpha})`);
        grad.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const bundle of bundles) {
        const dx = bundle.end.x - bundle.start.x, dy = bundle.end.y - bundle.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const wob = Math.sin(time * 0.0005 * bundle.wobbleSpeed + bundle.wobblePhase) * bundle.wobbleAmp * motionScale;
        const nx0 = -dy / len, ny0 = dx / len;
        const c1 = { x: bundle.start.x + dx * 0.33 + nx0 * wob, y: bundle.start.y + dy * 0.33 + ny0 * wob };
        const c2 = { x: bundle.start.x + dx * 0.66 - nx0 * wob * 0.6, y: bundle.start.y + dy * 0.66 - ny0 * wob * 0.6 };

        // Sample the centerline once per frame; every strand + the jacket reuse these points.
        const samples: { p: Point; nx: number; ny: number; t: number }[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
          const t = i / SAMPLES;
          const p = cubicPoint(bundle.start, c1, c2, bundle.end, t);
          const t2 = Math.min(1, t + 0.001);
          const p2 = cubicPoint(bundle.start, c1, c2, bundle.end, t2);
          const ddx = p2.x - p.x, ddy = p2.y - p.y;
          const dlen = Math.hypot(ddx, ddy) || 1;
          samples.push({ p, nx: -ddy / dlen, ny: ddx / dlen, t });
        }

        // Cable jacket — only over the tightly-bundled portion; breaks where the fan-out
        // begins so the sheath visually "opens" and bare colored fibers continue alone.
        ctx.beginPath();
        let sheathOpen = false;
        for (const s of samples) {
          const fan = fanFactor(bundle.fanAt, s.t);
          if (fan < 0.35) {
            if (!sheathOpen) { ctx.moveTo(s.p.x, s.p.y); sheathOpen = true; }
            else ctx.lineTo(s.p.x, s.p.y);
          } else {
            sheathOpen = false;
          }
        }
        ctx.strokeStyle = `rgba(${SHEATH_COLOR},0.42)`;
        ctx.lineWidth = bundle.bundleRadius * 2 + 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#1e293b';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (const strand of bundle.strands) {
          ctx.beginPath();
          samples.forEach((s, i) => {
            const fan = fanFactor(bundle.fanAt, s.t);
            const off = strand.slot * (bundle.bundleRadius + (bundle.fanSpread - bundle.bundleRadius) * fan);
            const x = s.p.x + s.nx * off, y = s.p.y + s.ny * off;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = strand.color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.1 * strand.widthJitter;
          ctx.shadowColor = strand.color;
          ctx.shadowBlur = 7;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;

          // Light pulse riding this exact strand path.
          const tp = (((time / 1000) * strand.pulseSpeed * motionScale + strand.pulsePhase) % 1 + 1) % 1;
          const idx = tp * SAMPLES;
          const i0 = Math.min(SAMPLES, Math.floor(idx));
          const i1 = Math.min(SAMPLES, i0 + 1);
          const frac = idx - i0;
          const s0 = samples[i0], s1 = samples[i1];
          const fan0 = fanFactor(bundle.fanAt, s0.t), fan1 = fanFactor(bundle.fanAt, s1.t);
          const off0 = strand.slot * (bundle.bundleRadius + (bundle.fanSpread - bundle.bundleRadius) * fan0);
          const off1 = strand.slot * (bundle.bundleRadius + (bundle.fanSpread - bundle.bundleRadius) * fan1);
          const x0 = s0.p.x + s0.nx * off0, y0 = s0.p.y + s0.ny * off0;
          const x1 = s1.p.x + s1.nx * off1, y1 = s1.p.y + s1.ny * off1;
          const px = x0 + (x1 - x0) * frac, py = y0 + (y1 - y0) * frac;
          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = strand.color;
          ctx.shadowBlur = 16;
          ctx.arc(px, py, strand.pulseSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      for (const p of particles) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * 0.0009 + p.phase);
        const alpha = p.baseAlpha * twinkle;
        const cycle = h + 20;
        const y = ((p.y - time * 0.004 * p.speed * motionScale) % cycle + cycle) % cycle - 10;
        const x = p.x + Math.sin(time * 0.0003 + p.phase) * p.drift;
        ctx.beginPath();
        ctx.fillStyle = `rgba(224,254,255,${alpha})`;
        ctx.shadowColor = '#67e8f9';
        ctx.shadowBlur = 6;
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
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
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,_#0b1128_0%,_#05070f_65%,_#010102_100%)]">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
