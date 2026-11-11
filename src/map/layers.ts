import * as THREE from 'three'
import { db, type LayerDef } from '../lib/data'
import { GROUND_RAMP_MIX, GROUND_TINT, HEIGHT_BOOST, SHAPE_OVERRIDES, rampOf } from '../lib/look'

/** world units: 1 unit = 1 km */
export const CELL_KM = 1.11
/** tallest possible column, in km, before a layer's heightScale is applied */
export const BASE_HEIGHT = 62
/**
 * Most of Bangladesh is densely populated, so a pure log->height mapping turns
 * the whole country into a carpet. This extra contrast keeps the low field as
 * short dots and reserves the tall spikes for the top of each layer's range.
 */
export const HEIGHT_CONTRAST = 2.1

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Interpolate a layer's ramp at t in 0..1 (categorical layers snap to a class). */
export function rampColorAt(layer: LayerDef, t: number): [number, number, number] {
  if (layer.type === 'categorical') {
    const id = Math.round(t * 255)
    const cls = layer.classes?.find((c) => c.id === id)
    return cls ? hexToRgb(cls.color) : [252, 251, 249]
  }
  const stops = rampOf(layer)
  if (!stops.length) return [252, 251, 249]
  const scaled = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  const f = scaled - i
  const a = hexToRgb(stops[i])
  const b = hexToRgb(stops[i + 1])
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

/** 256 px palette texture: continuous ramps interpolate, classes stay exact. */
export function makeRampTexture(layer: LayerDef): THREE.CanvasTexture {
  // a canvas texture keeps the palette in the exact byte values we put in it
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 1
  const ctx = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv)
  if (ctx) {
    const img = ctx.createImageData(256, 1)
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = i === 0 ? [252, 251, 249] : rampColorAt(layer, i / 255)
      img.data[i * 4] = r
      img.data[i * 4 + 1] = g
      img.data[i * 4 + 2] = b
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** Single-channel R8 texture, nearest sampling, one texel per grid cell. */
export function makeDataTexture(bin: Uint8Array, cols: number, rows: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(bin, cols, rows, THREE.RedFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return tex
}

/**
 * One source of truth for how a layer's columns are shaped, so the CPU height
 * used by labels and the shader uniforms in the map can never disagree.
 */
export function shapeOf(layer: LayerDef): { flat: boolean; scale: number; exp: number } {
  const override = SHAPE_OVERRIDES[layer.id]
  if (override) return override
  const boost = HEIGHT_BOOST[layer.id]
  const flat = layer.heightMode === 'flat'
  return {
    flat,
    scale: layer.heightScale * (boost?.scale ?? 1),
    exp: (layer.heightExponent + (boost?.exp ?? 0)) * HEIGHT_CONTRAST,
  }
}

/** Must match spikeShader.ts exactly so labels sit on the real columns. */
export function heightFor(layer: LayerDef, q: number): number {
  const t = Math.min(1, Math.max(0, q / 255))
  const shape = shapeOf(layer)
  if (shape.flat) return shape.scale * BASE_HEIGHT - (layer.sink ? t * 0.55 : 0)
  return Math.pow(t, shape.exp) * shape.scale * BASE_HEIGHT
}

/**
 * Paints the cream ground: a soft cast shadow of the country, then the active
 * layer's ramp blurred into a wash. Returns null until the layer is loaded.
 */
export function groundTexture(layer: LayerDef): THREE.CanvasTexture | null {
  const meta = db.meta
  const regions = db.regionsBin
  if (!meta || !regions) return null
  const bin = db.bins.get(layer.id)
  if (!bin) return null

  const low = document.createElement('canvas')
  low.width = meta.cols
  low.height = meta.rows
  const lctx = low.getContext('2d')
  if (!lctx) return null

  const tint = hexToRgb(GROUND_TINT[layer.id] ?? '#eef6f0')
  const crisp = layer.type === 'categorical' || shapeOf(layer).flat
  for (let r = 0; r < meta.rows; r++) {
    for (let c = 0; c < meta.cols; c++) {
      const i = r * meta.cols + c
      if (!regions[i]) continue
      const q = bin[i]
      const [rr, gg, bb] = q ? rampColorAt(layer, q / 255) : [246, 243, 236]
      // continuous layers wash into the pale tint; classes keep their own hue
      const mix = crisp ? 0 : GROUND_RAMP_MIX
      lctx.fillStyle = `rgb(${Math.round(tint[0] + (rr - tint[0]) * mix)},${Math.round(
        tint[1] + (gg - tint[1]) * mix,
      )},${Math.round(tint[2] + (bb - tint[2]) * mix)})`
      lctx.fillRect(c, r, 1, 1)
    }
  }

  const W = 900
  const H = Math.round((W * meta.rows) / meta.cols)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#fcfbf9'
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // soft cast shadow towards the south-east
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.filter = 'blur(18px) brightness(0.15)'
  ctx.drawImage(low, W * 0.014, H * 0.022, W * 0.985, H * 0.985)
  ctx.restore()

  // the layer wash: flat and class layers stay crisp so the categories read
  ctx.save()
  ctx.globalAlpha = crisp ? 1 : 0.88
  ctx.filter = `blur(${crisp ? 0.4 : 1.6}px)`
  ctx.drawImage(low, 0, 0, W, H)
  ctx.restore()

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export function disposeTexture(tex: THREE.Texture | null | undefined) {
  tex?.dispose()
}
