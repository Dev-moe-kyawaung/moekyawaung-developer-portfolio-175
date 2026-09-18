import LiveCanvas from './components/LiveCanvas';
import CodeBlock from './components/CodeBlock';
import * as S from './content/snippets';

const PROFILE_IMG = 'https://res.cloudinary.com/dye5qpwii/image/upload/v1778527878/IMG_20260430_053105_uef0yr.png';

const STACK = [
  { k: 'Renderer', v: 'Three.js r17x · WebGLRenderer (WebGL2) · WebGPURenderer progressive path when navigator.gpu is present' },
  { k: 'Integration', v: 'React 18 + Vite. Imperative scene class behind a thin useEffect — no React Three Fiber in the hot path so the lifecycle stays auditable' },
  { k: 'Shaders', v: 'Hand-written GLSL ShaderMaterial (vertex fbm displacement, fragment fresnel/specular gated by #if QUALITY). TSL port for the WebGPU path' },
  { k: 'Assets', v: 'glTF 2.0 → gltf-transform pipeline: dedup, weld, simplify, Draco (edgebreaker), KTX2/Basis textures, single 2048² atlas' },
  { k: 'Lifecycle', v: 'webglcontextlost/restored handlers, explicit dispose graph, IntersectionObserver + visibilitychange pause, ResizeObserver' },
  { k: 'Quality scaling', v: 'Static GPU tier (renderer string, deviceMemory, cores, MAX_TEXTURE_SIZE) + 90-frame rolling frame-budget monitor' },
];

const BUDGET = [
  { metric: 'Wire payload (models + textures)', before: '18.4 MB', after: '1.9 MB', note: 'Draco + KTX2 + simplify 0.6' },
  { metric: 'VRAM — textures', before: '21 MB (14 × PNG, uncompressed RGBA)', after: '2.1 MB (1 × ETC1S atlas)', note: 'GPU-native compressed stays compressed in VRAM' },
  { metric: 'Draw calls / frame', before: '41', after: '3', note: 'Atlas → one material → merged geometry' },
  { metric: 'Fragment cost @ DPR 3 (tier 1)', before: '9× fragments', after: '1× (clamped DPR 1.0)', note: 'Dynamic pixel ratio' },
  { metric: 'JS bundle (3D chunk)', before: '—', after: '~160 KB gz', note: 'Lazy chunk, tree-shaken three, decoders fetched on demand' },
  { metric: 'Main-thread blocking on load', before: '410 ms parse', after: '< 16 ms', note: 'Worker-side Draco decode' },
];

const BROWSER_MATRIX = [
  { env: 'Chrome / Edge (Win, ANGLE D3D11)', behaviour: 'WebGL2 + WebGPU. Context loss on GPU process crash — handled, auto-restores.' },
  { env: 'Safari 17+ (macOS / iOS)', behaviour: 'WebGL2 via Metal. Aggressive context eviction on background tabs and > 8 contexts. Restore path exercised on every tab switch.' },
  { env: 'Firefox', behaviour: 'WebGL2. No WEBGL_debug_renderer_info string masking exceptions → tier falls back to deviceMemory/cores heuristics.' },
  { env: 'Android Chrome (Mali / Adreno)', behaviour: 'Tile-based GPUs: preserveDrawingBuffer:false, no MSAA on tier ≤ 1, DPR clamped 1.0. Particles dropped on tier 0.' },
  { env: 'Headless / SwiftShader / VMs', behaviour: 'Detected as tier 0 → static poster fallback; the shader never compiles.' },
  { env: 'prefers-reduced-motion', behaviour: 'Canvas is opt-in; poster shown until the user clicks "Enable 3D canvas".' },
];

const GITHUB = 'https://github.com/moekyawaung-tech';

export default function App() {
  return (
    <div className="min-h-screen bg-[#05070f] text-slate-200 selection:bg-violet-500/40">
      {/* Background grain / gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_-10%,rgba(124,58,237,0.25),transparent),radial-gradient(40%_30%_at_90%_20%,rgba(34,211,238,0.12),transparent)]" />

      <header className="relative border-b border-white/5">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400">
            MKA · Graphics Engineering
          </a>
          <div className="hidden gap-6 font-mono text-xs text-slate-400 md:flex">
            <a href="#exhibit" className="hover:text-white">Exhibit</a>
            <a href="#assets" className="hover:text-white">01 Assets</a>
            <a href="#lifecycle" className="hover:text-white">02 Lifecycle</a>
            <a href="#ux" className="hover:text-white">03 UX Defense</a>
            <a href="#verdict" className="hover:text-white">Verdict</a>
          </div>
        </nav>
      </header>

      <main id="top" className="relative mx-auto max-w-6xl px-5">
        {/* HERO */}
        <section className="grid gap-10 pb-14 pt-16 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">Portfolio Technical Commentary</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Defending the 3D canvas:
              <span className="block bg-gradient-to-r from-violet-300 via-fuchsia-200 to-cyan-300 bg-clip-text text-transparent">
                why a shader belongs in a portfolio
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
              The common objection is that a WebGL hero is decorative weight: bytes, battery, and a spinning teapot that says
              nothing about engineering. This document argues the opposite — that a <em>correctly shipped</em> 3D element is
              the most honest artifact in a front-end portfolio, because it forces the author to reason about bytes, VRAM,
              driver failure, and thermal budgets in a way no CRUD dashboard can.
            </p>
            <div className="mt-8 flex flex-wrap gap-2 font-mono text-[11px]">
              {['Three.js', 'WebGL2', 'WebGPU (progressive)', 'Custom GLSL', 'glTF + Draco', 'KTX2 / Basis', 'React 18', 'TypeScript'].map((t) => (
                <span key={t} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-300">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-4">
              <img
                src={PROFILE_IMG}
                alt="Moe Kyaw Aung"
                className="h-16 w-16 rounded-xl object-cover ring-2 ring-violet-500/40"
                loading="eager"
              />
              <div>
                <p className="font-semibold text-white">Moe Kyaw Aung</p>
                <p className="text-sm text-slate-400">WebGL / WebGPU Graphics Engineer</p>
                <p className="font-mono text-[11px] text-slate-500">Senior Front-End · Real-time rendering</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 font-mono text-xs text-slate-400">
              <a href={GITHUB} target="_blank" rel="noreferrer" className="block truncate hover:text-cyan-300">
                github.com/moekyawaung-tech
              </a>
              <a href="https://github.com/Dev-moe-kyawaung/" target="_blank" rel="noreferrer" className="block truncate hover:text-cyan-300">
                github.com/Dev-moe-kyawaung
              </a>
              <a href="https://gravatar.com/moekyawaung2026" target="_blank" rel="noreferrer" className="block truncate hover:text-cyan-300">
                gravatar.com/moekyawaung2026
              </a>
              <a href="tel:+959889000889" className="block hover:text-cyan-300">
                +95 9 889 000 889
              </a>
            </div>
          </aside>
        </section>

        {/* EXHIBIT */}
        <section id="exhibit" className="scroll-mt-20 pb-16">
          <SectionHead
            index="Exhibit A"
            title="The element under defense"
            sub="Everything argued below is running in this canvas. Force a context loss, unmount it, override the GPU tier — and watch renderer.info account for every byte."
          />
          <LiveCanvas />
        </section>

        {/* STACK INPUT */}
        <section className="pb-16">
          <SectionHead index="Input" title="3D stack & implementation notes" sub="The stack this commentary is written against." />
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2">
            {STACK.map((s) => (
              <div key={s.k} className="bg-[#080b16] p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-300">{s.k}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* THESIS */}
        <Prose>
          <h2>The objection, stated fairly</h2>
          <p>
            A portfolio exists to reduce a hiring manager's uncertainty. A 3D canvas increases page weight, drains battery on
            a phone, can crash a tab on a low-end GPU, and is invisible to screen readers. If any of those happen during the
            thirty seconds someone spends on the page, the element has done net harm. <strong>I agree with all of that.</strong>{' '}
            The defense is not that 3D is pretty. The defense is that each of those failure modes has a known engineering
            answer, and that demonstrating those answers is the point. What follows is the standard I hold the element to,
            organised by the three areas where 3D on the web actually goes wrong: what you ship, how you hold it, and how you let go.
          </p>
        </Prose>

        {/* 01 ASSETS */}
        <section id="assets" className="scroll-mt-20 pt-6">
          <SectionHead
            index="01"
            title="Asset Optimization"
            sub="The wire budget and the VRAM budget are different budgets. Most 3D-on-the-web failures come from optimising only the first."
          />
          <Prose>
            <h3>Mesh compression: Draco inside glTF</h3>
            <p>
              glTF 2.0 is the container; Draco (<code>KHR_draco_mesh_compression</code>) is what makes it shippable. Raw
              glTF stores positions as three 32-bit floats per vertex plus 32-bit float normals and UVs — 32 bytes a vertex
              before indices. Draco quantizes positions to 14 bits, normals to 10 (octahedral), UVs to 12, then entropy-codes
              connectivity with Edgebreaker. On a 180k-triangle hero asset that is a <strong>~10× reduction</strong> with no
              visible error at portfolio viewing distances. Before compression I run <code>weld</code> and{' '}
              <code>simplify</code> (meshoptimizer's error-bounded decimation) so I am not compressing triangles that never
              contribute a pixel. The pipeline is deterministic and lives in CI:
            </p>
            <CodeBlock code={S.gltfPipeline} label="scripts/build-assets.sh" lang="bash" />
            <p>
              The runtime cost of Draco is the decoder: ~230 KB of WASM and CPU time to inflate. Both are handled by
              decoding in a Web Worker pool that <code>DRACOLoader</code> spins up, and by <code>preload()</code>-ing the
              decoder while the hero text renders. The main thread never parses geometry. When the target is exclusively
              WebGPU-capable hardware I switch to <code>EXT_meshopt_compression</code>, whose decoder is 30 KB and decodes
              directly into GPU-ready vertex layouts — but Draco still wins on universal support today.
            </p>
            <CodeBlock code={S.dracoLoader} label="src/gpu/loaders.ts" />

            <h3>Texture atlas packing (and why VRAM is the real metric)</h3>
            <p>
              A 2048×2048 PNG is 1.5 MB over the wire and <strong>16 MB in VRAM</strong>, because the GPU stores it as
              uncompressed RGBA8 with mipmaps (×1.33). Fourteen of them — a typical "artist handed me the Substance export"
              scenario — is 224 MB resident on a phone with a 1–2 GB shared memory budget. That is how tabs get killed.
              Two fixes compound:
            </p>
            <ul>
              <li>
                <strong>Atlas packing.</strong> Pack every material's albedo/normal/ORM into one 2048² sheet each. Fourteen
                texture binds become one; fourteen materials become one; and because there is now one material, the meshes
                can be merged into a single draw call. 41 draw calls → 3.
              </li>
              <li>
                <strong>GPU-native compression via KTX2 / Basis Universal.</strong> ETC1S/UASTC transcodes at load into
                whatever the GPU natively decodes — ASTC on Apple/Mali, BC7 on desktop, ETC2 on older Android. The texture
                stays compressed <em>in VRAM</em>: 16 MB becomes ~2.7 MB (UASTC) or ~1.4 MB (ETC1S).
              </li>
            </ul>
            <p>
              Atlasing has one classic bug — bilinear bleed between neighbouring tiles at mip boundaries. I bake a half-texel
              inset into the UV remap and add a 4-pixel gutter in the packer, which keeps mip level 2 clean:
            </p>
            <CodeBlock code={S.atlasUv} label="shaders/atlas.glsl" lang="glsl" />

            <h3>Shader complexity reduction</h3>
            <p>
              Shader cost scales with <em>fragments × instructions</em>. The asset pipeline controls neither; the shader
              author controls both. My rules for the portfolio material:
            </p>
            <ul>
              <li>
                <strong>Move work up the pipeline.</strong> The noise displacement in the exhibit runs in the vertex shader
                (≈ 20k invocations on tier 3) not the fragment shader (≈ 2M at DPR 2). Fragment stage receives an
                interpolated <code>vDisp</code> and does a single <code>smoothstep</code> to band it.
              </li>
              <li>
                <strong>Procedural over sampled.</strong> The noise is a hash-based value noise — zero texture fetches, zero
                VRAM, no dependency on texture cache behaviour on tile-based mobile GPUs.
              </li>
              <li>
                <strong>Preprocessor tiers, not uniforms.</strong> A <code>uniform int quality</code> branch still costs
                registers and, on many mobile compilers, executes both sides. <code>#if QUALITY &gt;= 2</code> deletes the
                fresnel and specular code from the compiled program on low-tier devices. One source, four binaries.
              </li>
              <li>
                <strong>Precision hygiene.</strong> <code>mediump</code> in the particle fragment shader; <code>highp</code>{' '}
                only where the world-position math needs it. On Adreno and Mali this halves ALU throughput cost.
              </li>
              <li>
                <strong>No post-processing on the portfolio path.</strong> Bloom means two extra render targets at full
                resolution plus a blur chain. The fresnel rim does 80% of the visual job at 0% of the bandwidth.
              </li>
            </ul>
            <CodeBlock code={S.shaderDefines} label="src/gpu/ShaderScene.ts + shaders.ts" />
          </Prose>

          <div className="my-10 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3">Naïve</th>
                  <th className="px-4 py-3">Shipped</th>
                  <th className="px-4 py-3">How</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {BUDGET.map((r) => (
                  <tr key={r.metric} className="bg-[#080b16]">
                    <td className="px-4 py-3 text-slate-200">{r.metric}</td>
                    <td className="px-4 py-3 font-mono text-xs text-rose-300/80">{r.before}</td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-300">{r.after}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 02 LIFECYCLE */}
        <section id="lifecycle" className="scroll-mt-20 pt-6">
          <SectionHead
            index="02"
            title="Resource Lifecycle"
            sub="A WebGL context is a borrowed handle to hardware the browser can revoke at any moment. Code that assumes otherwise is code that crashes on Safari."
          />
          <Prose>
            <h3>Context loss handling</h3>
            <p>
              The browser will take your context away: when the GPU process crashes, when the OS reclaims VRAM under
              pressure, when Safari backgrounds a tab, when a laptop switches from discrete to integrated graphics, or
              simply when a page opens too many contexts (the limit is around 16 in Chrome). When that happens every
              buffer, texture, program and framebuffer handle becomes invalid, and every subsequent GL call is a silent
              no-op — unless you handle the event, in which case it is a recoverable pause.
            </p>
            <p>
              The critical detail is <code>event.preventDefault()</code> on <code>webglcontextlost</code>. Without it the
              browser assumes you do not care and never dispatches <code>webglcontextrestored</code>. With it, the
              restoration path is: halt the loop, mark the UI, wait, then re-upload. The CPU-side scene graph survives
              intact, so "re-upload" is just rebuilding GPU handles — no network, no decode.
            </p>
            <CodeBlock code={S.contextLoss} label="src/gpu/ShaderScene.ts — context loss" />
            <p>
              Because <code>WEBGL_lose_context</code> lets you trigger loss programmatically, this path is unit-testable.
              The "Force context loss" button in Exhibit A calls exactly that extension. The event log shows the loop halt,
              the 1.4 s gap, and the resume with <code>renderer.info.memory</code> back at its steady-state numbers.
            </p>

            <h3>VRAM disposal on unmount</h3>
            <p>
              JavaScript garbage collection does not free GPU memory. A <code>THREE.Texture</code> that goes out of scope
              leaves its <code>WebGLTexture</code> resident until the context itself dies. In a single-page app where the
              user navigates away from the hero and back, every visit without disposal leaks the full scene's VRAM. After
              five navigations on a phone the tab is gone. The disposal graph must be explicit and ordered:
            </p>
            <CodeBlock code={S.disposal} label="src/components/LiveCanvas.tsx + ShaderScene.dispose()" />
            <p>
              Two details matter. First, <code>renderer.forceContextLoss()</code> after <code>renderer.dispose()</code> — a
              disposed renderer still owns a live context slot in the browser's pool; releasing it means the next mount is
              guaranteed a fresh one instead of evicting somebody else's. Second, the assertion on{' '}
              <code>renderer.info.memory</code>. The "Unmount (dispose)" control in the exhibit runs this path and the panel
              reports <code>geometries: 0, textures: 0</code> before the renderer goes away. That readout is the proof; the
              code is just the argument.
            </p>

            <h3>Dynamic pixel ratio scaling by GPU tier</h3>
            <p>
              Fragment work scales with the square of the pixel ratio. A modern phone at <code>devicePixelRatio</code> 3
              asks the GPU to shade nine times the fragments of a 1× display, and a mid-range Mali cannot do it at 60 Hz for
              anything beyond a flat-shaded cube. Rendering at native DPR is the single most common reason portfolio 3D
              feels bad on mobile. The fix has two stages:
            </p>
            <p>
              <strong>Static tiering</strong> on mount, from signals the browser gives away for free — the unmasked renderer
              string, <code>deviceMemory</code>, <code>hardwareConcurrency</code>, <code>MAX_TEXTURE_SIZE</code>, and whether
              the pointer is coarse. The probe context is released immediately so it doesn't count against the pool.
            </p>
            <CodeBlock code={S.gpuDetect} label="src/gpu/gpuTier.ts" />
            <p>
              <strong>Runtime correction</strong> because the static guess is wrong often enough to matter — Firefox masks
              renderer strings, a laptop may be on battery, a desktop may be running four other GPU-heavy tabs. A rolling
              90-frame window of frame times demotes the tier when the average exceeds 24 ms and promotes (rate-limited,
              never above the detected ceiling) when there is headroom. Tier changes swap the DPR clamp, the shader defines,
              the icosahedron subdivision, MSAA, and the particle count in one atomic rebuild.
            </p>
            <CodeBlock code={S.dprScaling} label="src/gpu/gpuTier.ts — FrameBudget" />
            <p>
              Two more lifecycle rules that cost nothing and save a lot: an <code>IntersectionObserver</code> stops the loop
              when the canvas scrolls out of view, and <code>visibilitychange</code> stops it when the tab is hidden. A
              portfolio hero should draw zero frames while someone is reading the case studies below it.
            </p>
          </Prose>
        </section>

        {/* 03 UX DEFENSE */}
        <section id="ux" className="scroll-mt-20 pt-6">
          <SectionHead
            index="03"
            title="User Experience Defense"
            sub="What the element actually demonstrates to a reviewer — and why a static screenshot could not."
          />
          <Prose>
            <h3>It demonstrates low-level systems programming</h3>
            <p>
              Most front-end work lives on top of a runtime that hides the machine. WebGL does not. To ship the exhibit I
              had to reason about vertex layouts and quantization bit-depths, about which stage of the pipeline an
              instruction belongs in, about tile-based deferred rendering and why <code>preserveDrawingBuffer</code>{' '}
              forces a resolve on every frame on Apple GPUs, about precision qualifiers and register pressure on mobile
              compilers. These are the same concerns as embedded or game-engine work — expressed in TypeScript and GLSL,
              but not abstracted away. A reviewer who opens the <code>ShaderScene</code> class sees a render loop, not a
              framework.
            </p>

            <h3>It demonstrates memory management</h3>
            <p>
              Garbage-collected languages train engineers out of thinking about ownership. GPU resources reintroduce it:
              every geometry, material, texture and render target is a handle that <em>you</em> allocated and{' '}
              <em>you</em> must free, in the right order, exactly once, including on paths where the browser tore the
              context down underneath you. The exhibit makes the accounting visible on purpose. A hiring manager can
              press "Unmount", read <code>textures: 0</code>, press "Remount", and know that the person who built this
              understands why that number matters. No React component can show that.
            </p>

            <h3>It demonstrates cross-browser resilience</h3>
            <p>
              The GPU stack is the least standardised part of the web platform. The same shader compiles through ANGLE
              to D3D11 on Windows, to Metal on macOS and iOS, to native GL on Linux, and to whatever driver an Android
              vendor shipped in 2019. Renderer strings are masked or absent depending on the browser's privacy posture.
              Context eviction policy differs by an order of magnitude between Chrome and Safari. Building something that
              degrades gracefully across that matrix — rather than working on the author's MacBook — is the entire skill.
            </p>
          </Prose>

          <div className="my-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {BROWSER_MATRIX.map((r) => (
              <div key={r.env} className="bg-[#080b16] p-5">
                <p className="font-mono text-xs text-cyan-300">{r.env}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{r.behaviour}</p>
              </div>
            ))}
          </div>

          <Prose>
            <h3>And it respects the user first</h3>
            <p>
              None of the above justifies harming a visitor. So the element is bounded by non-negotiables: it is a lazy
              chunk that never blocks first paint; it honours <code>prefers-reduced-motion</code> by rendering a static
              poster until opted in; it has a text alternative via <code>aria-label</code> and conveys no information that
              isn't also in the DOM; it draws nothing off-screen or in a background tab; and on tier 0 it never compiles a
              shader at all. The defense of the 3D canvas is precisely that it is engineered to disappear whenever it
              should.
            </p>
          </Prose>
        </section>

        {/* VERDICT */}
        <section id="verdict" className="scroll-mt-20 py-6">
          <SectionHead index="Verdict" title="Ship it — under these conditions" sub="The checklist I hold every interactive 3D element to before it enters a portfolio." />
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['Wire budget', '≤ 2 MB total for the 3D chunk + assets; Draco/meshopt + KTX2 mandatory.'],
              ['VRAM budget', '≤ 32 MB resident on tier 1; measured with renderer.info, not estimated.'],
              ['Frame budget', '≤ 16.6 ms at DPR clamp on the detected tier; auto-demote on sustained miss.'],
              ['Context loss', 'preventDefault + restore path; exercised via WEBGL_lose_context in tests.'],
              ['Disposal', 'Unmount ⇒ geometries 0 / textures 0 / programs 0 ⇒ forceContextLoss.'],
              ['Visibility', 'No frames drawn off-screen or in hidden tabs; IO + visibilitychange.'],
              ['Accessibility', 'reduced-motion opt-in, aria-label, no information exclusive to the canvas.'],
              ['Fallback', 'Tier 0 / no WebGL ⇒ static poster; the page is complete without the canvas.'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-[10px] text-emerald-300 ring-1 ring-emerald-500/40">
                  ✓
                </span>
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.15em] text-slate-300">{k}</p>
                  <p className="mt-1 text-sm text-slate-400">{v}</p>
                </div>
              </div>
            ))}
          </div>

          <Prose>
            <p>
              A portfolio should show the work you want to be hired for. If that work is building things that run on
              hardware, in browsers you don't control, for people on devices you've never seen — then a 3D canvas that
              compresses its assets, survives a driver reset, frees its memory, and scales itself to the GPU it lands on
              is not decoration. It is the résumé.
            </p>
          </Prose>
        </section>
      </main>

      <footer className="relative mt-16 border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src={PROFILE_IMG} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10" loading="lazy" />
            <div>
              <p className="text-sm font-medium text-white">Moe Kyaw Aung</p>
              <p className="font-mono text-[11px] text-slate-500">WebGL / WebGPU · Three.js · Custom shaders · React</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-400">
            <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-cyan-300">GitHub</a>
            <a href="https://moekyawaung-tech.github.io/" target="_blank" rel="noreferrer" className="hover:text-cyan-300">Portfolio</a>
            <a href="https://moekyawaung.lovable.app" target="_blank" rel="noreferrer" className="hover:text-cyan-300">Bio</a>
            <a href="tel:+959889000889" className="hover:text-cyan-300">+95 9 889 000 889</a>
            <a href="tel:+959666000050" className="hover:text-cyan-300">+95 9 666 000 050</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ index, title, sub }: { index: string; title: string; sub: string }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">{index}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-400">{sub}</p>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="prose-custom max-w-3xl">{children}</div>;
}
