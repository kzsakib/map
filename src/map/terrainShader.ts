import type * as THREE from 'three'

/**
 * Continuous terrain surface: one plane displaced by the baked height field plus
 * the active layer's own heights. The fragment stage multiplies the layer ramp
 * by the baked relief (hillshade + AO), so the colour is printed onto the model
 * rather than painted on a flat sheet.
 */
export const terrainVertex = /* glsl */ `
uniform sampler2D uTerrainHeight;
uniform sampler2D uMask;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uRampA;
uniform sampler2D uRampB;
uniform sampler2D uRegions;
uniform sampler2D uDivisions;

uniform vec2 uSize;
uniform vec2 uTSize;
uniform vec2 uGrid;
uniform vec2 uHeight;
uniform vec2 uExp;
uniform vec2 uColorPow;
uniform vec2 uFlat;
uniform vec2 uSink;
uniform float uCatA;
uniform float uCatB;
uniform float uMix;
uniform float uMorph;
uniform float uPop;
uniform float uPlinth;
uniform float uSelDistrict;
uniform float uSelDivision;
uniform float uHoverDistrict;
uniform vec2 uPopCenter;
uniform float uPopRadius;
uniform float uTerrainScale;
uniform float uDataBase;

varying vec3 vColor;
varying vec3 vNormalW;
varying vec2 vMaskUv;
varying float vFogDepth;
varying float vKeep;
varying float vHover;
varying float vSelected;

vec3 ramp(sampler2D tex, float t) {
  float u = (clamp(t, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
  return texture2D(tex, vec2(u, 0.5)).rgb;
}

/** 1 inside the selected district or division, 0 elsewhere. */
float selected(vec2 p) {
  if (uSelDistrict > 0.5 && abs(texture2D(uRegions, p).r * 255.0 - uSelDistrict) < 0.6) return 1.0;
  if (uSelDivision > 0.5 && abs(texture2D(uDivisions, p).r * 255.0 - uSelDivision) < 0.6) return 1.0;
  return 0.0;
}

float columnHeight(float t, float scale, float expo, float flatLayer, float sink) {
  float h = flatLayer > 0.5 ? scale : pow(max(t, 0.0), expo) * scale;
  h -= flatLayer > 0.5 ? sink * t : 0.0;
  return max(h, 0.0) * uDataBase;
}

void main() {
  // the height field and the layer rasters both start at row 0 = north
  vec2 huv = vec2(uv.x, 1.0 - uv.y);
  float maskV = texture2D(uMask, uv).r;
  vMaskUv = uv;

  float tA = texture2D(uTexA, huv).r;
  float tB = texture2D(uTexB, huv).r;

  float hA = uCatA > 0.5
    ? texture2D(uRampA, vec2(clamp(tA, 0.0, 1.0), 0.5)).a * uHeight.x * uDataBase
    : columnHeight(tA, uHeight.x, uExp.x, uFlat.x, uSink.x);
  float hB = uCatB > 0.5
    ? texture2D(uRampB, vec2(clamp(tB, 0.0, 1.0), 0.5)).a * uHeight.y * uDataBase
    : columnHeight(tB, uHeight.y, uExp.y, uFlat.y, uSink.y);
  float dataH = mix(hA, hB, uMix);

  float region = texture2D(uRegions, huv).r * 255.0;

  // The region raster is 1 km and the mesh is finer than that, so a hard
  // inside/outside test lifted alternate vertices and left a comb of fins along
  // every district edge. Feathering the test over two cells fixes the ramp.
  vec2 cell = 2.0 / uGrid;
  float isSel = (
    selected(huv) * 2.0 +
    selected(huv + vec2(cell.x, 0.0)) +
    selected(huv - vec2(cell.x, 0.0)) +
    selected(huv + vec2(0.0, cell.y)) +
    selected(huv - vec2(0.0, cell.y))
  ) / 6.0;
  float hasSel = clamp(uSelDistrict + uSelDivision, 0.0, 1.0);

  float keep = mix(1.0, mix(1.0, 0.2, uMorph * (1.0 - isSel)), hasSel);

  vKeep = keep;
  vSelected = isSel * hasSel;
  vHover = (uHoverDistrict > 0.5 && abs(region - uHoverDistrict) < 0.6) ? 1.0 : 0.0;

  float cA = pow(clamp(tA, 0.0, 1.0), uColorPow.x);
  float cB = pow(clamp(tB, 0.0, 1.0), uColorPow.y);
  vColor = mix(ramp(uRampA, cA), ramp(uRampB, cB), uMix);

  float terrainH = texture2D(uTerrainHeight, huv).r * uTerrainScale;

  // the plane sits in local XY and is rotated onto the ground; local +z is up
  vec3 p = position;
  float worldX = p.x;
  float worldZ = -p.y;
  float delay = clamp(distance(vec2(worldX, worldZ), uPopCenter) / max(uPopRadius, 1.0), 0.0, 1.0) * 0.45;
  float pop = smoothstep(delay, delay + 0.55, uPop) * isSel * hasSel;

  // cells outside the country flatten to the ground plane and are discarded later
  float rise = (terrainH + dataH) * maskV * keep + uPlinth * pop * maskV;
  p.z += rise;

  // cheap finite-difference normal, kept for the slope tint and the water sheen
  float dx = uSize.x / uTSize.x;
  float dz = uSize.y / uTSize.y;
  float hL = texture2D(uTerrainHeight, huv - vec2(1.0 / uTSize.x, 0.0)).r;
  float hR = texture2D(uTerrainHeight, huv + vec2(1.0 / uTSize.x, 0.0)).r;
  float hD = texture2D(uTerrainHeight, huv - vec2(0.0, 1.0 / uTSize.y)).r;
  float hU = texture2D(uTerrainHeight, huv + vec2(0.0, 1.0 / uTSize.y)).r;
  float sx = (hR - hL) * uTerrainScale / (2.0 * dx);
  float sz = (hD - hU) * uTerrainScale / (2.0 * dz);
  vec3 n = normalize(vec3(-sx, 1.0, -sz));
  vec3 blend = normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.85));
  vNormalW = normalize(vec3(blend.x, blend.y, -blend.z));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;

  gl_Position = projectionMatrix * mv;
}
`

export const terrainFragment = /* glsl */ `
precision highp float;

uniform sampler2D uMask;
uniform sampler2D uHillshade;
uniform sampler2D uAO;
uniform sampler2D uWater;
uniform sampler2D uNoise;

uniform float uAOAmount;
uniform float uGrain;
uniform float uOpacity;
uniform float uTime;
uniform vec3 uCream;

varying vec3 vColor;
varying vec3 vNormalW;
varying vec2 vMaskUv;
varying float vFogDepth;
varying float vKeep;
varying float vHover;
varying float vSelected;

void main() {
  // outside the country outline there is no surface at all
  // cut at the outline; the wall sits just outside it and hides the fringe
  if (texture2D(uMask, vMaskUv).r < 0.5) discard;

  float hs = texture2D(uHillshade, vMaskUv).r;
  float ao = texture2D(uAO, vMaskUv).r;
  float water = texture2D(uWater, vMaskUv).r;

  // printed relief: pull the ramp 15% toward luminance before shading
  float luma = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 base = mix(vColor, vec3(luma), 0.15);

  // the baked hillshade sits around mid-grey, so map it around 1.0: relief must
  // modulate the colour, not dim the whole plate
  float relief = mix(0.70, 1.30, hs);
  vec3 col = base * mix(1.0, relief, 0.75);
  col *= mix(1.0, mix(0.62, 1.0, ao), uAOAmount);

  // warm key on the lit slopes, violet in the shadows
  col += vec3(0.040, 0.024, 0.004) * smoothstep(0.62, 1.0, hs);
  col = mix(col, vec3(0.812, 0.784, 1.0), 0.12 * (1.0 - smoothstep(0.10, 0.58, hs)));

  // gentle S-curve for print contrast
  vec3 sc = clamp(col, 0.0, 1.0);
  sc = sc * sc * (3.0 - 2.0 * sc);
  col = mix(col, sc, 0.22);

  // fine tileable noise so flat fields are not plastic at close range
  float grain = texture2D(uNoise, vMaskUv * vec2(40.0, 51.0)).r;
  col *= 1.0 + (grain - 0.5) * 0.06;

  // water: smoother, cooler, with a thin highlight along the lit channel banks
  float wm = smoothstep(0.25, 0.7, water);
  vec3 wet = mix(col, vec3(0.66, 0.77, 0.80), 0.42);
  float sheen = pow(clamp(hs, 0.0, 1.0), 18.0) * 0.35 + smoothstep(0.88, 1.0, hs) * 0.30;
  wet += vec3(0.85, 0.92, 0.98) * sheen * 0.45;
  col = mix(col, wet, wm);

  // selection and hover stay legible on top of the relief
  col = mix(col, vec3(0.122, 0.478, 0.329), vHover * 0.20);
  col = mix(col, col * 1.03 + vec3(0.012), vSelected * 0.35);

  // filmic shoulder (ACES fit) at exposure 1.0, blended so the cream palette
  // and the ramp hues survive the highlight roll-off
  vec3 film = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  col = mix(col, film, 0.55);

  // 3% film grain
  float g = fract(sin(dot(vMaskUv * 917.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.03 * uGrain;

  // cream haze toward the far edge of the plate
  col = mix(col, uCream, smoothstep(1500.0, 3400.0, vFogDepth) * 0.5);

  gl_FragColor = vec4(col, uOpacity);
}
`

export function terrainUniforms() {
  return {
    uTerrainHeight: { value: null as THREE.Texture | null },
    uMask: { value: null as THREE.Texture | null },
    uHillshade: { value: null as THREE.Texture | null },
    uAO: { value: null as THREE.Texture | null },
    uWater: { value: null as THREE.Texture | null },
    uNoise: { value: null as THREE.Texture | null },
    uTexA: { value: null as THREE.Texture | null },
    uTexB: { value: null as THREE.Texture | null },
    uRampA: { value: null as THREE.Texture | null },
    uRampB: { value: null as THREE.Texture | null },
    uRegions: { value: null as THREE.Texture | null },
    uDivisions: { value: null as THREE.Texture | null },
    uSize: { value: [530, 678] as [number, number] },
    uTSize: { value: [2048, 2618] as [number, number] },
    uGrid: { value: [478, 611] as [number, number] },
    uHeight: { value: [1, 1] as [number, number] },
    uExp: { value: [1, 1] as [number, number] },
    uColorPow: { value: [1, 1] as [number, number] },
    uFlat: { value: [0, 0] as [number, number] },
    uSink: { value: [0, 0] as [number, number] },
    uCatA: { value: 0 },
    uCatB: { value: 0 },
    uMix: { value: 0 },
    uMorph: { value: 0 },
    uPop: { value: 0 },
    uPlinth: { value: 10 },
    uSelDistrict: { value: 0 },
    uSelDivision: { value: 0 },
    uHoverDistrict: { value: 0 },
    uPopCenter: { value: [0, 0] as [number, number] },
    uPopRadius: { value: 400 },
    uTerrainScale: { value: 11.5 },
    uDataBase: { value: 22 },
    uAOAmount: { value: 1 },
    uGrain: { value: 1 },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
    uCream: { value: [0.988, 0.984, 0.976] as [number, number, number] },
  }
}
