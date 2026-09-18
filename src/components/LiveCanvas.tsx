import { useCallback, useEffect, useRef, useState } from 'react';
import { ShaderScene, type SceneStats } from '../gpu/ShaderScene';
import type { GpuProfile, GpuTier } from '../gpu/gpuTier';

const EMPTY: SceneStats = {
  fps: 0,
  frameMs: 0,
  dpr: 0,
  tier: 2,
  tierLabel: '—',
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  contextLost: false,
  contextLossCount: 0,
  restoreCount: 0,
  disposed: false,
  events: [],
};

function CanvasSurface({
  onStats,
  onProfile,
  sceneRef,
}: {
  onStats: (s: SceneStats) => void;
  onProfile: (p: GpuProfile) => void;
  sceneRef: React.MutableRefObject<ShaderScene | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: ShaderScene | null = null;
    try {
      scene = new ShaderScene(canvas, { onStats, onProfile });
      sceneRef.current = scene;
    } catch (err) {
      console.error('WebGL init failed', err);
    }
    return () => {
      // React unmount → deterministic VRAM release.
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [onStats, onProfile, sceneRef]);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Interactive shader-driven 3D object" />;
}

export default function LiveCanvas() {
  const [stats, setStats] = useState<SceneStats>(EMPTY);
  const [profile, setProfile] = useState<GpuProfile | null>(null);
  const [mounted, setMounted] = useState(true);
  const [reducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [optIn, setOptIn] = useState(!reducedMotion);
  const sceneRef = useRef<ShaderScene | null>(null);

  const onStats = useCallback((s: SceneStats) => setStats(s), []);
  const onProfile = useCallback((p: GpuProfile) => setProfile(p), []);

  const active = mounted && optIn;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-[#070a14] shadow-2xl shadow-violet-950/40 lg:aspect-auto lg:min-h-[420px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.18),transparent_60%)]" />
        {active ? (
          <CanvasSurface onStats={onStats} onProfile={onProfile} sceneRef={sceneRef} />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-violet-600 to-cyan-400 opacity-70 blur-[1px]" />
            <p className="text-sm text-slate-300">
              {!optIn ? 'Reduced-motion preference detected — canvas is opt-in.' : 'Canvas unmounted. All GPU resources released.'}
            </p>
            <button
              onClick={() => {
                setOptIn(true);
                setMounted(true);
              }}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
            >
              {optIn ? 'Remount canvas' : 'Enable 3D canvas'}
            </button>
          </div>
        )}

        {active && stats.contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="rounded-xl border border-amber-400/40 bg-amber-950/60 px-5 py-3 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-amber-300">webglcontextlost</p>
              <p className="mt-1 text-sm text-amber-100">Loop halted. Waiting for restore…</p>
            </div>
          </div>
        )}

        {active && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 font-mono text-[11px]">
            <Badge tone={stats.fps >= 50 ? 'good' : stats.fps >= 30 ? 'warn' : 'bad'}>{stats.fps || '—'} fps</Badge>
            <Badge>{stats.frameMs.toFixed(1)} ms</Badge>
            <Badge>DPR {stats.dpr.toFixed(2)}</Badge>
            <Badge tone="accent">Tier {stats.tier} · {stats.tierLabel}</Badge>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] text-slate-500">move pointer to deform</p>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="renderer.info (live)">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
            <Row k="draw calls" v={stats.drawCalls} />
            <Row k="triangles" v={stats.triangles.toLocaleString()} />
            <Row k="geometries" v={stats.geometries} highlight={stats.disposed && stats.geometries === 0} />
            <Row k="textures" v={stats.textures} highlight />
            <Row k="programs" v={stats.programs} />
            <Row k="ctx lost / restored" v={`${stats.contextLossCount} / ${stats.restoreCount}`} />
          </dl>
        </Panel>

        <Panel title="GPU profile">
          {profile ? (
            <div className="space-y-1.5 font-mono text-xs text-slate-300">
              <p className="truncate" title={profile.renderer}>
                <span className="text-slate-500">renderer </span>
                {profile.renderer}
              </p>
              <p>
                <span className="text-slate-500">api </span>
                {profile.webgl2 ? 'WebGL2' : 'WebGL1'}
                {profile.webgpu ? ' · WebGPU available' : ' · no WebGPU'}
              </p>
              <p>
                <span className="text-slate-500">max tex </span>
                {profile.maxTextureSize}px · <span className="text-slate-500">dpr cap </span>
                {profile.maxPixelRatio.toFixed(2)}
              </p>
              {profile.reasons.length > 0 && (
                <p className="text-slate-500">signals: {profile.reasons.join(' · ')}</p>
              )}
            </div>
          ) : (
            <p className="font-mono text-xs text-slate-500">—</p>
          )}
        </Panel>

        <Panel title="lifecycle controls">
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => sceneRef.current?.simulateContextLoss()} disabled={!active || stats.contextLost}>
              Force context loss
            </Btn>
            <Btn
              onClick={() => setMounted((m) => !m)}
              disabled={!optIn}
              tone={mounted ? 'danger' : 'ok'}
            >
              {mounted ? 'Unmount (dispose)' : 'Remount'}
            </Btn>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-500">tier override</span>
            {([0, 1, 2, 3] as GpuTier[]).map((t) => (
              <button
                key={t}
                disabled={!active}
                onClick={() => sceneRef.current?.lockTier(t)}
                className={`h-7 w-7 rounded-md font-mono text-xs ring-1 transition disabled:opacity-40 ${
                  stats.tier === t
                    ? 'bg-violet-600 text-white ring-violet-400'
                    : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="event log" className="flex-1">
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-slate-400">
            {stats.events.length === 0 && <li className="text-slate-600">waiting…</li>}
            {stats.events.map((e, i) => (
              <li key={i} className={i === 0 ? 'text-cyan-300' : ''}>
                {e}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const tones = {
    neutral: 'bg-black/50 text-slate-200 ring-white/10',
    good: 'bg-emerald-950/70 text-emerald-300 ring-emerald-500/30',
    warn: 'bg-amber-950/70 text-amber-300 ring-amber-500/30',
    bad: 'bg-rose-950/70 text-rose-300 ring-rose-500/30',
    accent: 'bg-violet-950/70 text-violet-200 ring-violet-500/30',
  };
  return <span className={`rounded-md px-2 py-1 ring-1 backdrop-blur ${tones[tone]}`}>{children}</span>;
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: React.ReactNode; highlight?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className={`text-right ${highlight ? 'text-emerald-300' : 'text-slate-200'}`}>{v}</dd>
    </>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'ok';
}) {
  const tones = {
    default: 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10',
    danger: 'bg-rose-500/10 text-rose-200 ring-rose-500/30 hover:bg-rose-500/20',
    ok: 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30 hover:bg-emerald-500/20',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
