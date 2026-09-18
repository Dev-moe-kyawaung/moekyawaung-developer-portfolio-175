/**
 * GPU tier detection.
 *
 * Strategy (cheap → expensive):
 *  1. Static heuristics: renderer string via WEBGL_debug_renderer_info,
 *     hardware concurrency, deviceMemory, max texture size, coarse pointer.
 *  2. Runtime probe: a short frame-time benchmark run by the render loop,
 *     which can demote a tier if the device cannot hold budget.
 *
 * The tier feeds the pixel-ratio clamp and shader quality defines.
 */

export type GpuTier = 0 | 1 | 2 | 3;

export interface GpuProfile {
  tier: GpuTier;
  label: string;
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  maxPixelRatio: number;
  webgl2: boolean;
  webgpu: boolean;
  reasons: string[];
}

const TIER_DPR: Record<GpuTier, number> = {
  0: 0.75,
  1: 1,
  2: 1.5,
  3: 2,
};

const TIER_LABEL: Record<GpuTier, string> = {
  0: 'Fallback',
  1: 'Low',
  2: 'Mid',
  3: 'High',
};

export function dprForTier(tier: GpuTier): number {
  return Math.min(window.devicePixelRatio || 1, TIER_DPR[tier]);
}

export function detectGpuProfile(): GpuProfile {
  const reasons: string[] = [];
  let renderer = 'unknown';
  let vendor = 'unknown';
  let maxTextureSize = 0;
  let webgl2 = false;

  const probe = document.createElement('canvas');
  const gl =
    (probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as
      | WebGL2RenderingContext
      | null) ||
    (probe.getContext('webgl') as WebGLRenderingContext | null);

  if (gl) {
    webgl2 = gl instanceof WebGL2RenderingContext;
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
    } else {
      renderer = String(gl.getParameter(gl.RENDERER));
      vendor = String(gl.getParameter(gl.VENDOR));
    }
    // Release the probe context immediately — it must not linger in VRAM.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } else {
    reasons.push('No WebGL context available');
  }

  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

  let score = 2; // start at mid, adjust from evidence
  const r = renderer.toLowerCase();

  if (!gl) score = 0;
  if (!webgl2) {
    score -= 1;
    reasons.push('WebGL1 only');
  }

  // Software rasterisers — never spend real pixels here.
  if (/swiftshader|llvmpipe|software|mesa offscreen/.test(r)) {
    score = 0;
    reasons.push('Software rasteriser detected');
  }

  // Discrete / high-end signals
  if (/rtx|radeon rx|apple m[1-9]|geforce (gtx|rtx)|arc a/.test(r)) {
    score += 1;
    reasons.push('Discrete or Apple-silicon GPU');
  }
  // Integrated / mobile signals
  if (/intel\(r\) (hd|uhd)|mali-(4|t)|adreno \(tm\) [3-5]|powervr/.test(r)) {
    score -= 1;
    reasons.push('Integrated or older mobile GPU');
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) {
    score -= 1;
    reasons.push(`deviceMemory ≤ 4GB (${nav.deviceMemory})`);
  }
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    score -= 1;
    reasons.push(`hardwareConcurrency ≤ 4 (${navigator.hardwareConcurrency})`);
  }
  if (maxTextureSize && maxTextureSize < 8192) {
    score -= 1;
    reasons.push(`MAX_TEXTURE_SIZE ${maxTextureSize}`);
  }
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    reasons.push('Coarse pointer (touch device)');
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    reasons.push('prefers-reduced-motion');
  }

  const tier = Math.max(0, Math.min(3, score)) as GpuTier;

  return {
    tier,
    label: TIER_LABEL[tier],
    renderer,
    vendor,
    maxTextureSize,
    maxPixelRatio: dprForTier(tier),
    webgl2,
    webgpu,
    reasons,
  };
}

/**
 * Rolling frame-time monitor. Feed it `delta` each frame; it returns a
 * recommendation to demote or promote the current tier.
 */
export class FrameBudget {
  private samples: number[] = [];
  private readonly window: number;
  private cooldown = 0;

  constructor(windowSize = 90) {
    this.window = windowSize;
  }

  push(deltaMs: number): 'demote' | 'promote' | 'hold' {
    this.samples.push(deltaMs);
    if (this.samples.length > this.window) this.samples.shift();
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return 'hold';
    }
    if (this.samples.length < this.window) return 'hold';

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg > 24) {
      // ~41 fps or worse sustained — shed pixels.
      this.cooldown = this.window * 2;
      this.samples = [];
      return 'demote';
    }
    if (avg < 12) {
      // Comfortable headroom — allow promotion (rate limited).
      this.cooldown = this.window * 4;
      this.samples = [];
      return 'promote';
    }
    return 'hold';
  }

  get averageMs(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
