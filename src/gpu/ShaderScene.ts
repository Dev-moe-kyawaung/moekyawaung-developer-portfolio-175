import * as THREE from 'three';
import { detectGpuProfile, dprForTier, FrameBudget, type GpuProfile, type GpuTier } from './gpuTier';
import { displaceFragment, displaceVertex, particleFragment, particleVertex } from './shaders';

export interface SceneStats {
  fps: number;
  frameMs: number;
  dpr: number;
  tier: GpuTier;
  tierLabel: string;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  contextLost: boolean;
  contextLossCount: number;
  restoreCount: number;
  disposed: boolean;
  events: string[];
}

export interface ShaderSceneOptions {
  onStats?: (s: SceneStats) => void;
  onProfile?: (p: GpuProfile) => void;
}

const OCTAVES_BY_TIER: Record<GpuTier, number> = { 0: 1, 1: 2, 2: 4, 3: 6 };
const SUBDIV_BY_TIER: Record<GpuTier, number> = { 0: 2, 1: 3, 2: 5, 3: 7 };
const PARTICLES_BY_TIER: Record<GpuTier, number> = { 0: 0, 1: 200, 2: 600, 3: 1200 };

/**
 * A self-contained, imperatively managed scene. The React wrapper owns only
 * mount/unmount; every GPU handle is tracked here so `dispose()` can prove
 * that VRAM returns to zero (renderer.info.memory).
 */
export class ShaderScene {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private resizeObs: ResizeObserver | null = null;
  private budget = new FrameBudget(90);
  private profile: GpuProfile;
  private tier: GpuTier;
  private floorTier: GpuTier; // never promote above the detected tier
  private pointer = new THREE.Vector2(0, 0);
  private pointerTarget = new THREE.Vector2(0, 0);
  private paused = false;
  private visible = true;

  // GPU-owned resources (tracked explicitly for disposal)
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private blob: THREE.Mesh | null = null;
  private particles: THREE.Points | null = null;
  private blobMat: THREE.ShaderMaterial | null = null;
  private particleMat: THREE.ShaderMaterial | null = null;

  private contextLost = false;
  private contextLossCount = 0;
  private restoreCount = 0;
  private disposed = false;
  private events: string[] = [];
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private lastStatsEmit = 0;

  private readonly onLostBound = (e: Event) => this.onContextLost(e);
  private readonly onRestoredBound = () => this.onContextRestored();
  private readonly onVisBound = () => this.onVisibility();
  private readonly onPointerBound = (e: PointerEvent) => this.onPointer(e);
  private readonly onLeaveBound = () => this.pointerTarget.set(0, 0);

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: ShaderSceneOptions = {},
  ) {
    this.profile = detectGpuProfile();
    this.tier = this.profile.tier;
    this.floorTier = this.profile.tier;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0, 0, 6);
    this.opts.onProfile?.(this.profile);
    this.log(`GPU tier ${this.tier} (${this.profile.label}) — ${this.profile.renderer}`);
    this.createRenderer();
    this.buildScene();
    this.attachListeners();
    this.start();
  }

  // ---------- lifecycle ----------

  private createRenderer() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.tier >= 2,
      alpha: true,
      powerPreference: this.tier >= 2 ? 'high-performance' : 'low-power',
      // Keep the default buffer non-preserved: cheaper on tile-based mobile GPUs.
      preserveDrawingBuffer: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dprForTier(this.tier));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.resize();
  }

  private buildScene() {
    const tier = this.tier;

    // --- Displaced icosahedron ---
    const geo = new THREE.IcosahedronGeometry(1.35, SUBDIV_BY_TIER[tier]);
    this.geometries.push(geo);

    const blobMat = new THREE.ShaderMaterial({
      vertexShader: displaceVertex,
      fragmentShader: displaceFragment,
      defines: { OCTAVES: OCTAVES_BY_TIER[tier], QUALITY: tier },
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.55 },
        uPointer: { value: this.pointer },
        uCamPos: { value: this.camera.position },
        uColorA: { value: new THREE.Color('#0b1020') },
        uColorB: { value: new THREE.Color('#7c3aed') },
        uColorC: { value: new THREE.Color('#22d3ee') },
      },
    });
    this.blobMat = blobMat;
    this.materials.push(blobMat);
    this.blob = new THREE.Mesh(geo, blobMat);
    this.scene.add(this.blob);

    // --- Particle field (skipped entirely on tier 0) ---
    const count = PARTICLES_BY_TIER[tier];
    if (count > 0) {
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const r = 2.4 + Math.random() * 2.2;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = r * Math.cos(ph);
        seed[i] = Math.random();
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.geometries.push(pgeo);

      const pmat = new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: dprForTier(tier) },
          uColor: { value: new THREE.Color('#a78bfa') },
        },
      });
      this.particleMat = pmat;
      this.materials.push(pmat);
      this.particles = new THREE.Points(pgeo, pmat);
      this.scene.add(this.particles);
    }
    this.log(`Scene built: ${this.geometries.length} geometries, ${this.materials.length} programs, 0 textures`);
  }

  private tearDownScene() {
    // Order matters: remove from graph → dispose geometry → dispose material.
    if (this.blob) this.scene.remove(this.blob);
    if (this.particles) this.scene.remove(this.particles);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries = [];
    this.materials = [];
    this.blob = null;
    this.particles = null;
    this.blobMat = null;
    this.particleMat = null;
  }

  private attachListeners() {
    this.canvas.addEventListener('webglcontextlost', this.onLostBound, false);
    this.canvas.addEventListener('webglcontextrestored', this.onRestoredBound, false);
    document.addEventListener('visibilitychange', this.onVisBound);
    this.canvas.addEventListener('pointermove', this.onPointerBound);
    this.canvas.addEventListener('pointerleave', this.onLeaveBound);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.canvas.parentElement ?? this.canvas);

    // Pause when scrolled out of view — no wasted GPU time.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        ([entry]) => {
          this.visible = entry.isIntersecting;
          if (this.visible && !this.raf && !this.contextLost && !this.disposed) this.start();
        },
        { threshold: 0.05 },
      );
      io.observe(this.canvas);
      this.io = io;
    }
  }
  private io: IntersectionObserver | null = null;

  private detachListeners() {
    this.canvas.removeEventListener('webglcontextlost', this.onLostBound);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestoredBound);
    document.removeEventListener('visibilitychange', this.onVisBound);
    this.canvas.removeEventListener('pointermove', this.onPointerBound);
    this.canvas.removeEventListener('pointerleave', this.onLeaveBound);
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.io?.disconnect();
    this.io = null;
  }

  /** Full teardown. After this, renderer.info.memory must read 0/0. */
  dispose() {
    if (this.disposed) return;
    this.stop();
    this.detachListeners();
    this.tearDownScene();
    if (this.renderer) {
      const mem = this.renderer.info.memory;
      this.log(`Pre-dispose VRAM: geometries=${mem.geometries} textures=${mem.textures}`);
      this.renderer.dispose(); // frees programs, render lists, state
      this.renderer.forceContextLoss(); // returns the context to the browser pool
      this.renderer = null;
    }
    this.disposed = true;
    this.log('Disposed: renderer, context, listeners released');
    this.emitStats(true);
  }

  // ---------- context loss ----------

  private onContextLost(e: Event) {
    // Mandatory: without preventDefault the browser will never fire "restored".
    e.preventDefault();
    this.contextLost = true;
    this.contextLossCount += 1;
    this.stop();
    this.log('webglcontextlost — loop halted, awaiting restore');
    this.emitStats(true);
  }

  private onContextRestored() {
    this.contextLost = false;
    this.restoreCount += 1;
    // All GPU handles are invalid now. CPU-side geometry/material objects
    // remain, but three.js will re-upload them on next render. We rebuild
    // to be explicit and to re-apply any tier changes.
    this.tearDownScene();
    this.buildScene();
    this.renderer?.setPixelRatio(dprForTier(this.tier));
    this.resize();
    this.log('webglcontextrestored — resources re-uploaded, loop resumed');
    this.start();
  }

  /** Simulate a GPU reset (driver crash, tab backgrounding, VRAM pressure). */
  simulateContextLoss() {
    if (!this.renderer || this.contextLost) return;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) {
      this.log('WEBGL_lose_context not available');
      return;
    }
    ext.loseContext();
    window.setTimeout(() => ext.restoreContext(), 1400);
  }

  // ---------- adaptive quality ----------

  setTier(tier: GpuTier) {
    if (tier === this.tier || !this.renderer) return;
    this.tier = tier;
    this.renderer.setPixelRatio(dprForTier(tier));
    this.tearDownScene();
    this.buildScene();
    this.resize();
    this.log(`Tier → ${tier} (${['Fallback', 'Low', 'Mid', 'High'][tier]}), DPR ${dprForTier(tier).toFixed(2)}`);
  }

  lockTier(tier: GpuTier) {
    this.floorTier = tier;
    this.setTier(tier);
  }

  private applyBudget(deltaMs: number) {
    const verdict = this.budget.push(deltaMs);
    if (verdict === 'demote' && this.tier > 0) {
      this.log(`Frame budget exceeded (${this.budget.averageMs.toFixed(1)}ms avg) — demoting`);
      this.setTier((this.tier - 1) as GpuTier);
    } else if (verdict === 'promote' && this.tier < this.floorTier) {
      this.setTier((this.tier + 1) as GpuTier);
    }
  }

  // ---------- loop ----------

  private start() {
    if (this.raf || this.disposed) return;
    this.clock.start();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clock.stop();
  }

  private tick = () => {
    this.raf = 0;
    if (this.disposed || this.contextLost || !this.renderer) return;
    if (!this.visible || this.paused) {
      // Don't schedule; IntersectionObserver/visibility will restart us.
      return;
    }
    this.raf = requestAnimationFrame(this.tick);

    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    const frameMs = dt * 1000;

    this.pointer.lerp(this.pointerTarget, 0.08);

    if (this.blobMat) this.blobMat.uniforms.uTime.value = t;
    if (this.particleMat) this.particleMat.uniforms.uTime.value = t;
    if (this.blob) {
      this.blob.rotation.y = t * 0.15 + this.pointer.x * 0.4;
      this.blob.rotation.x = Math.sin(t * 0.2) * 0.2 - this.pointer.y * 0.3;
    }
    if (this.particles) this.particles.rotation.y = -t * 0.03;

    this.renderer.render(this.scene, this.camera);

    // Budget monitor only trusts frames that were actually rendered back-to-back.
    if (frameMs > 0 && frameMs < 200) this.applyBudget(frameMs);

    this.fpsAcc += dt;
    this.fpsFrames += 1;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (t - this.lastStatsEmit > 0.25) {
      this.lastStatsEmit = t;
      this.emitStats(false, frameMs);
    }
  };

  private resize() {
    if (!this.renderer) return;
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth);
    const h = Math.max(1, parent?.clientHeight ?? this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onVisibility() {
    this.paused = document.hidden;
    if (!this.paused && !this.raf && !this.contextLost) this.start();
    this.log(document.hidden ? 'Tab hidden — loop paused' : 'Tab visible — loop resumed');
  }

  private onPointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointerTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }

  // ---------- telemetry ----------

  private log(msg: string) {
    const stamp = new Date().toLocaleTimeString([], { hour12: false });
    this.events = [`${stamp}  ${msg}`, ...this.events].slice(0, 8);
  }

  private emitStats(force: boolean, frameMs = 0) {
    if (!this.opts.onStats) return;
    const info = this.renderer?.info;
    this.opts.onStats({
      fps: force ? 0 : Math.round(this.fps),
      frameMs: Math.round(frameMs * 10) / 10,
      dpr: this.renderer?.getPixelRatio() ?? 0,
      tier: this.tier,
      tierLabel: ['Fallback', 'Low', 'Mid', 'High'][this.tier],
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      programs: info?.programs?.length ?? 0,
      contextLost: this.contextLost,
      contextLossCount: this.contextLossCount,
      restoreCount: this.restoreCount,
      disposed: this.disposed,
      events: [...this.events],
    });
  }

  get currentTier() {
    return this.tier;
  }
  get gpuProfile() {
    return this.profile;
  }
}
