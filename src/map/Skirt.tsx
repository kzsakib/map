import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { db } from '../lib/data'
import { lonToX, latToZ } from './camera'
import { terrainWorldY, type Terrain } from './terrain'

/** the slab reads about 2.5% of the map width thick */
const DEPTH_RATIO = 0.03

function ringsFromOutline(): [number, number][][] {
  const outline = db.outline as unknown as {
    features: { geometry: { type: string; coordinates: unknown } }[]
  }
  const out: [number, number][][] = []
  for (const f of outline?.features ?? []) {
    const g = f.geometry
    const polys = g.type === 'MultiPolygon' ? (g.coordinates as [number, number][][][]) : [g.coordinates as [number, number][][]]
    for (const poly of polys) {
      for (const ring of poly) if (ring.length > 3) out.push(ring)
    }
  }
  return out
}

/**
 * The country as a physical slab: a side wall extruded down from the coastline,
 * sand at the foot rising to cream at the rim, with a thin golden edge light.
 */
export default function Skirt({ terrain }: { terrain: Terrain }) {
  const depth = DEPTH_RATIO * terrain.w

  const geometry = useMemo(() => {
    const rings = ringsFromOutline()
    const positions: number[] = []
    const normals: number[] = []
    const tops: number[] = []
    const index: number[] = []

    for (const ring of rings) {
      const n = ring.length
      const start = positions.length / 3
      // push the wall a little outside the outline so it covers the ragged
      // cut of the terrain mask, which never lands exactly on the boundary
      let area = 0
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[(i + 1) % n]
        area += lonToX(ax) * latToZ(by) - lonToX(bx) * latToZ(ay)
      }
      const sign = area >= 0 ? 1 : -1
      for (let i = 0; i < n; i++) {
        const [lon, lat] = ring[i]
        const x = lonToX(lon)
        const z = latToZ(lat)
        // the rim sits a hair proud of the surface so it hides the mask's cut edge
        const y = terrainWorldY(terrain, lon, lat) + 0.9
        // smooth wall normal from the ring tangent
        const [lonA, latA] = ring[(i - 1 + n) % n]
        const [lonB, latB] = ring[(i + 1) % n]
        const tx = lonToX(lonB) - lonToX(lonA)
        const tz = latToZ(latB) - latToZ(latA)
        const len = Math.hypot(tx, tz) || 1
        const nx = tz / len
        const nz = -tx / len

        const OUT = 0.55
        const ox = x + nx * OUT * sign
        const oz = z + nz * OUT * sign
        positions.push(ox, y, oz)
        normals.push(nx, 0, nz)
        tops.push(1)
        positions.push(ox, -depth, oz)
        normals.push(nx, 0, nz)
        tops.push(0)
      }
      for (let i = 0; i < n; i++) {
        const a = start + i * 2
        const b = start + ((i + 1) % n) * 2
        index.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1))
    geo.setIndex(index)
    geo.computeBoundingSphere()
    return geo
  }, [terrain, depth])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: new THREE.Vector3(-0.46, 0.55, 0.38).normalize() } },
        vertexShader: /* glsl */ `
          attribute float aTop;
          varying float vTop;
          varying vec3 vN;
          void main() {
            vTop = aTop;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform vec3 uSun;
          varying float vTop;
          varying vec3 vN;
          void main() {
            // sand at the foot, cream at the rim
            vec3 sand = vec3(0.792, 0.714, 0.588);
            vec3 rimTop = vec3(0.953, 0.918, 0.855);
            vec3 col = mix(sand, rimTop, smoothstep(0.0, 0.92, vTop));
            // soft side light so the wall is not a flat ribbon
            float lam = 0.72 + 0.28 * abs(dot(normalize(vN), uSun));
            col *= lam;
            // thin golden rim light along the top edge (#f3c98b at ~25%)
            col += vec3(0.953, 0.788, 0.545) * 0.25 * smoothstep(0.93, 1.0, vTop);
            gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
          }
        `,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  return <mesh geometry={geometry} material={material} renderOrder={1} frustumCulled={false} />
}
