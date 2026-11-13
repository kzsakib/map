import * as THREE from 'three'
import { BASE, db } from '../lib/data'
import { CELL_KM } from './layers'

/**
 * The baked terrain grid (scripts/build_terrain.py). It covers exactly the same
 * bbox as the 1 km data grid, so both can share one UV mapping.
 */
export type Terrain = {
  cols: number
  rows: number
  bbox: [number, number, number, number]
  minElev: number
  maxElev: number
  /** 0..1 elevation per pixel, row 0 = north (flipY false texture) */
  heights: Float32Array
  texture: THREE.DataTexture
  /** world units a fully elevated pixel reaches (km * exaggeration) */
  heightScale: number
  /** world extent of the grid, in km */
  w: number
  h: number
}

/** how much the relief is stretched vertically; the country is very flat */
export const TERRAIN_EXAGGERATION = 12

let pending: Promise<Terrain> | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`terrain image failed: ${url}`))
    img.src = url
  })
}

async function build(): Promise<Terrain> {
  const [meta, img] = await Promise.all([
    fetch(`${BASE}data/terrain/terrain.json`).then((r) => {
      if (!r.ok) throw new Error(`terrain.json -> HTTP ${r.status}`)
      return r.json() as Promise<{ cols: number; rows: number; minElev: number; maxElev: number; bbox: number[] }>
    }),
    loadImage(`${BASE}data/terrain/height.png`),
  ])

  const cols = meta.cols
  const rows = meta.rows
  const cv = document.createElement('canvas')
  cv.width = cols
  cv.height = rows
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable for terrain decode')
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, cols, rows).data

  // R = high byte, G = low byte, packed by the baker
  const span = Math.max(1, meta.maxElev - meta.minElev)
  const heights = new Float32Array(cols * rows)
  for (let i = 0, p = 0; i < heights.length; i++, p += 4) {
    heights[i] = (((px[p] << 8) | px[p + 1]) & 0xffff) / span
  }

  const texture = new THREE.DataTexture(heights, cols, rows, THREE.RedFormat, THREE.FloatType)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true

  return {
    cols,
    rows,
    bbox: [meta.bbox[0], meta.bbox[1], meta.bbox[2], meta.bbox[3]],
    minElev: meta.minElev,
    maxElev: meta.maxElev,
    heights,
    texture,
    heightScale: (span / 1000) * TERRAIN_EXAGGERATION,
    w: db.meta!.cols * CELL_KM,
    h: db.meta!.rows * CELL_KM,
  }
}

/** decode the shared height field once; every consumer awaits the same promise */
export function loadTerrain(): Promise<Terrain> {
  if (!pending) pending = build()
  return pending
}

/** world height of the bare terrain at a lon/lat (no layer data added) */
export function terrainWorldY(t: Terrain, lon: number, lat: number): number {
  const [x0, y0, x1, y1] = t.bbox
  const fx = Math.min(t.cols - 1, Math.max(0, ((lon - x0) / (x1 - x0)) * (t.cols - 1)))
  const fy = Math.min(t.rows - 1, Math.max(0, ((y1 - lat) / (y1 - y0)) * (t.rows - 1)))
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const i00 = iy * t.cols + ix
  const i10 = Math.min(t.heights.length - 1, i00 + 1)
  const i01 = Math.min(t.heights.length - 1, i00 + t.cols)
  const i11 = Math.min(t.heights.length - 1, i01 + 1)
  const a = t.heights[i00] * (1 - tx) + t.heights[i10] * tx
  const b = t.heights[i01] * (1 - tx) + t.heights[i11] * tx
  return (a * (1 - ty) + b * ty) * t.heightScale
}
