import type * as THREE from 'three'

/** Instanced spike shader: one draw call for ~124k columns. */
export const spikeVertex = /* glsl */ `
attribute vec2 aCell;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uRampA;
uniform sampler2D uRampB;
uniform sampler2D uRegions;
uniform sampler2D uDivisions;
// baked terrain, so a needle stands on the surface instead of the old flat plate
uniform sampler2D uTerrain;
uniform float uTerrainScale;

uniform vec2 uGrid;
uniform float uCellSize;
uniform float uBaseHeight;
uniform vec2 uColorPow;
uniform float uMix;
uniform float uMorph;
uniform float uWidth;
uniform float uSelDistrict;
uniform float uSelDivision;
uniform float uHoverDistrict;
uniform vec2 uHeight;
uniform vec2 uExp;
uniform vec2 uFlat;
uniform vec2 uSink;
// 1 when the layer is categorical and gets its height from the ramp alpha
uniform float uCatA;
uniform float uCatB;

// district pop-up: uPop runs 0..1, the shader staggers cells by distance
uniform float uPop;
uniform vec2 uPopCenter;
uniform float uPopRadius;
uniform float uPlinth;

varying vec3 vColor;
varying vec3 vNormalW;
varying float vKeep;
varying float vHover;
varying float vSelected;

vec3 ramp(sampler2D tex, float t) {
  float u = (clamp(t, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
  return texture2D(tex, vec2(u, 0.5)).rgb;
}

// NB: "flat" is a reserved word in GLSL ES 1.00, so the flag is flatLayer.
float columnHeight(float t, float scale, float expo, float flatLayer, float sink) {
  float h = flatLayer > 0.5 ? scale : pow(max(t, 0.0), expo) * scale;
  h *= uBaseHeight;
  h -= flatLayer > 0.5 ? sink * t * 0.55 : 0.0;
  return h;
}

void main() {
  vec2 uv = (aCell + 0.5) / uGrid;
  float tA = texture2D(uTexA, uv).r;
  float tB = texture2D(uTexB, uv).r;
  float t = mix(tA, tB, uMix);

  float hA = uCatA > 0.5
    ? texture2D(uRampA, vec2(clamp(tA, 0.0, 1.0), 0.5)).a * uHeight.x * uBaseHeight
    : columnHeight(tA, uHeight.x, uExp.x, uFlat.x, uSink.x);
  float hB = uCatB > 0.5
    ? texture2D(uRampB, vec2(clamp(tB, 0.0, 1.0), 0.5)).a * uHeight.y * uBaseHeight
    : columnHeight(tB, uHeight.y, uExp.y, uFlat.y, uSink.y);
  float h = mix(hA, hB, uMix);

  float region = texture2D(uRegions, uv).r * 255.0;
  float division = texture2D(uDivisions, uv).r * 255.0;

  float isSel = 0.0;
  if (uSelDistrict > 0.5 && abs(region - uSelDistrict) < 0.6) isSel = 1.0;
  if (uSelDivision > 0.5 && abs(division - uSelDivision) < 0.6) isSel = 1.0;
  float hasSel = clamp(uSelDistrict + uSelDivision, 0.0, 1.0);

  float keep = mix(1.0, mix(1.0, 0.2, uMorph * (1.0 - isSel)), hasSel);
  h *= keep;

  vKeep = keep;
  vSelected = isSel * hasSel;
  vHover = (uHoverDistrict > 0.5 && abs(region - uHoverDistrict) < 0.6) ? 1.0 : 0.0;
  // colour compression: only the tall cells take the saturated end of the ramp,
  // so the field stays pale like a printed relief instead of a red carpet
  float cA = pow(clamp(tA, 0.0, 1.0), uColorPow.x);
  float cB = pow(clamp(tB, 0.0, 1.0), uColorPow.y);
  vColor = mix(ramp(uRampA, cA), ramp(uRampB, cB), uMix);
  vNormalW = normalize(normal + vec3(0.0, 0.18, 0.0));

  float cx = (aCell.x + 0.5 - uGrid.x * 0.5) * uCellSize;
  float cz = (aCell.y + 0.5 - uGrid.y * 0.5) * uCellSize;

  // ripple: cells nearer the district centre start lifting sooner
  float delay = clamp(distance(vec2(cx, cz), uPopCenter) / max(uPopRadius, 1.0), 0.0, 1.0) * 0.45;
  float pop = smoothstep(delay, delay + 0.55, uPop) * isSel * hasSel;

  vec3 local = position;
  local.xz *= uWidth;
  local.y *= max(h, 0.02 * keep);
  local.y *= 1.0 + 0.5 * pop;
  local.y += uPlinth * pop;

  float base = texture2D(uTerrain, vec2(uv.x, 1.0 - uv.y)).r * uTerrainScale;
  vec3 world = vec3(cx + local.x, base + local.y, cz + local.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

export const spikeFragment = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying vec3 vNormalW;
varying float vKeep;
varying float vHover;
varying float vSelected;

const vec3 CREAM = vec3(0.988, 0.984, 0.976);

void main() {
  vec3 n = normalize(vNormalW);
  vec3 L = normalize(vec3(-0.42, 0.82, 0.34));
  float lambert = max(dot(n, L), 0.0);
  float wrap = 0.5 + 0.5 * dot(n, L);
  float shade = 0.74 + 0.40 * mix(lambert, wrap, 0.55);
  float up = clamp(n.y, 0.0, 1.0);
  float tip = smoothstep(0.90, 1.0, up);

  // slightly darker flanks, brighter tips: makes thin columns read as relief
  vec3 col = vColor * shade * mix(0.90, 1.06, up) + vec3(0.04, 0.03, 0.02) * tip;
  col = mix(CREAM, col, mix(0.16, 1.0, vKeep));
  col = mix(col, vec3(0.122, 0.478, 0.329), vHover * 0.30);
  col = mix(col, col * 1.04 + vec3(0.02), vSelected * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
`

export function spikeUniforms() {
  return {
    uTexA: { value: null as THREE.Texture | null },
    uTexB: { value: null as THREE.Texture | null },
    uRampA: { value: null as THREE.Texture | null },
    uRampB: { value: null as THREE.Texture | null },
    uCatA: { value: 0 },
    uCatB: { value: 0 },
    uRegions: { value: null as THREE.Texture | null },
    uDivisions: { value: null as THREE.Texture | null },
    uTerrain: { value: null as THREE.Texture | null },
    uTerrainScale: { value: 11.5 },
    uGrid: { value: [478, 611] as [number, number] },
    uCellSize: { value: 1.11 },
    uBaseHeight: { value: 34 },
    uMix: { value: 0 },
    uMorph: { value: 0 },
    uWidth: { value: 1 },
    uSelDistrict: { value: 0 },
    uSelDivision: { value: 0 },
    uHoverDistrict: { value: 0 },
    uHeight: { value: [1, 1] },
    uExp: { value: [1.4, 1.4] },
    uColorPow: { value: [1, 1] },
    uPop: { value: 0 },
    uPopCenter: { value: [0, 0] as [number, number] },
    uPopRadius: { value: 400 },
    uPlinth: { value: 26 },
    uFlat: { value: [0, 0] },
    uSink: { value: [0, 0] },
  }
}
