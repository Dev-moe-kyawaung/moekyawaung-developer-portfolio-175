/**
 * Custom GLSL. Complexity is gated by the QUALITY define which is set per GPU
 * tier. Everything expensive (fbm octaves, fresnel, rim) collapses to cheaper
 * paths on low tiers instead of shipping a separate material.
 */

export const displaceVertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uPointer;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vDisp;

  // Cheap 3D hash-based value noise. No texture lookups → no VRAM cost.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    // QUALITY: 1 → 2 octaves, 2 → 4 octaves, 3 → 6 octaves
    for (int i = 0; i < OCTAVES; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec3(11.3, 7.1, 3.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = position;
    float t = uTime * 0.35;
    float n = fbm(normal * 1.6 + vec3(t, t * 0.7, -t * 0.4));
    // Pointer influence in object space — cheap dot product bulge.
    vec3 pointerDir = normalize(vec3(uPointer * 1.5, 1.0));
    float bulge = pow(max(dot(normal, pointerDir), 0.0), 6.0) * 0.35;
    float d = (n - 0.5) * uAmp + bulge;
    p += normal * d;

    vDisp = d;
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const displaceFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uCamPos;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vDisp;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);

    float ndl = dot(N, normalize(vec3(0.6, 0.8, 0.5))) * 0.5 + 0.5;
    float band = smoothstep(-0.25, 0.35, vDisp);
    vec3 base = mix(uColorA, uColorB, band);
    base = mix(base, uColorC, pow(ndl, 3.0) * 0.6);

    #if QUALITY >= 2
      // Fresnel rim only on mid/high tiers.
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      base += uColorC * fres * 0.8;
    #endif

    #if QUALITY >= 3
      // Specular lobe + subtle iridescent shift on high tier.
      vec3 H = normalize(V + normalize(vec3(0.6, 0.8, 0.5)));
      float spec = pow(max(dot(N, H), 0.0), 48.0);
      base += vec3(spec) * 0.5;
      base += 0.06 * vec3(sin(vDisp * 20.0 + uTime), sin(vDisp * 20.0 + 2.1), sin(vDisp * 20.0 + 4.2));
    #endif

    gl_FragColor = vec4(base, 1.0);
  }
`;

export const particleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float t = uTime * 0.15 + aSeed * 6.2831;
    p.x += sin(t * 1.3 + aSeed * 10.0) * 0.25;
    p.y += cos(t * 0.9 + aSeed * 7.0) * 0.25;
    p.z += sin(t * 1.1 + aSeed * 3.0) * 0.25;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = (1.5 + aSeed * 2.5) * uPixelRatio;
    gl_PointSize = size * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = 0.25 + 0.5 * aSeed;
  }
`;

export const particleFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.0, d) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`;
