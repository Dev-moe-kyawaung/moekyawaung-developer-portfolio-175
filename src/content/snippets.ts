export const gltfPipeline = `
# Asset build step (CI). Source: hero.blend → hero.glb (18.4 MB raw)
gltf-transform dedup     hero.glb hero.glb              # merge duplicate accessors
gltf-transform prune     hero.glb hero.glb              # drop unused nodes/materials
gltf-transform weld      hero.glb hero.glb --tolerance 0.0001
gltf-transform simplify  hero.glb hero.glb --ratio 0.6 --error 0.001
gltf-transform resize    hero.glb hero.glb --width 1024 --height 1024
gltf-transform etc1s     hero.glb hero.glb --quality 200   # KTX2 / Basis Universal
gltf-transform draco     hero.glb hero.glb --method edgebreaker \\
  --quantize-position 14 --quantize-normal 10 --quantize-texcoord 12
# Result: 1.9 MB over the wire, 3 draw calls, 1 texture atlas (2 MB VRAM, not 21 MB)
`;

export const dracoLoader = `
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const draco = new DRACOLoader()
  .setDecoderPath('/decoders/draco/')     // WASM, ~230 KB, cached
  .setDecoderConfig({ type: 'wasm' })
  .preload();                             // warm the decoder worker pool early

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/decoders/basis/')
  .detectSupport(renderer);               // picks ASTC / ETC2 / BC7 / PVRTC per GPU

const loader = new GLTFLoader()
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2);

// Decoding happens in Web Workers — the main thread never blocks on 18 MB of geometry.
const { scene } = await loader.loadAsync('/models/hero.glb');
`;

export const atlasUv = `
// One 2048² atlas instead of 14 loose textures → 14 texture binds collapse to 1,
// 14 materials collapse to 1, and mesh batching becomes legal.
// UV remap is baked offline; at runtime the shader only needs the sub-rect.
uniform vec4 uAtlasRect;   // x, y, w, h in [0,1] atlas space

vec2 atlasUv(vec2 uv) {
  // Inset by half a texel so bilinear filtering never bleeds a neighbour tile.
  vec2 inset = 0.5 / vec2(2048.0) / uAtlasRect.zw;
  uv = mix(inset, 1.0 - inset, fract(uv));
  return uAtlasRect.xy + uv * uAtlasRect.zw;
}
`;

export const shaderDefines = `
// One material, four cost profiles. The preprocessor removes dead branches at
// compile time — a tier-0 device never even sees the fresnel or specular code.
const material = new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  defines: {
    OCTAVES: { 0: 1, 1: 2, 2: 4, 3: 6 }[tier],  // fbm octaves in the vertex stage
    QUALITY: tier,                              // gates #if blocks in the fragment stage
  },
});

// fragment.glsl
#if QUALITY >= 2
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);   // 1 pow, 1 dot — mid tier and up
#endif
#if QUALITY >= 3
  float spec = pow(max(dot(N, H), 0.0), 48.0);        // high tier only
#endif
`;

export const contextLoss = `
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();          // REQUIRED — otherwise 'restored' never fires
  cancelAnimationFrame(raf);   // stop touching a dead context
  setState({ contextLost: true });
}, false);

canvas.addEventListener('webglcontextrestored', () => {
  // Every GPU handle (buffers, textures, programs, FBOs) is now garbage.
  // CPU-side scene graph survives; rebuild uploads and resume.
  tearDownScene();
  buildScene();
  renderer.setPixelRatio(dprForTier(tier));
  start();
}, false);

// Test path: WEBGL_lose_context lets CI reproduce a driver reset deterministically.
const ext = gl.getExtension('WEBGL_lose_context');
ext.loseContext();  setTimeout(() => ext.restoreContext(), 1400);
`;

export const disposal = `
useEffect(() => {
  const scene = new ShaderScene(canvasRef.current);
  return () => scene.dispose();   // React unmount ⇒ deterministic VRAM release
}, []);

dispose() {
  cancelAnimationFrame(this.raf);
  resizeObserver.disconnect(); intersectionObserver.disconnect();
  canvas.removeEventListener('webglcontextlost', ...);

  scene.remove(mesh);                       // 1. detach from graph
  for (const g of geometries) g.dispose();  // 2. gl.deleteBuffer for each attribute
  for (const m of materials)  m.dispose();  // 3. gl.deleteProgram (refcounted)
  for (const t of textures)   t.dispose();  // 4. gl.deleteTexture
  renderTarget?.dispose();                  // 5. gl.deleteFramebuffer + attachments

  console.assert(renderer.info.memory.geometries === 0);
  console.assert(renderer.info.memory.textures   === 0);

  renderer.dispose();            // programs, render lists, bindings, state cache
  renderer.forceContextLoss();   // hand the context back to the browser's pool (limit ≈ 16)
}
`;

export const dprScaling = `
const TIER_DPR = { 0: 0.75, 1: 1.0, 2: 1.5, 3: 2.0 };
renderer.setPixelRatio(Math.min(devicePixelRatio, TIER_DPR[tier]));

// A 3× iPhone rendering at native DPR pushes 9× the fragments of 1×.
// Clamping tier 1 to DPR 1.0 is a 9× fragment-shader saving for a blur
// the eye cannot see on a moving, lit surface.

// Runtime guard: static detection is a guess; frame time is the truth.
const verdict = frameBudget.push(deltaMs);     // 90-frame rolling window
if (verdict === 'demote')  setTier(tier - 1);  // avg > 24 ms sustained → shed pixels
if (verdict === 'promote') setTier(tier + 1);  // avg < 12 ms, rate-limited, never above detected tier
`;

export const gpuDetect = `
const gl  = probe.getContext('webgl2');
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);   // "Apple M2", "Mali-G52", "SwiftShader"…

let score = 2;
if (/swiftshader|llvmpipe/.test(renderer))          score = 0;  // software rasteriser: bail
if (/rtx|radeon rx|apple m[1-9]/.test(renderer))    score += 1;
if (/mali-(4|t)|adreno \\(tm\\) [3-5]/.test(renderer)) score -= 1;
if (navigator.deviceMemory <= 4)                    score -= 1;
if (navigator.hardwareConcurrency <= 4)             score -= 1;
if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < 8192)    score -= 1;

gl.getExtension('WEBGL_lose_context')?.loseContext(); // the probe must not hold a context
`;
