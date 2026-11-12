import * as THREE from 'three'
import { db } from '../lib/data'
import { CELL_KM } from './layers'

export type CamState = {
  tx: number
  tz: number
  radius: number
  phi: number
  theta: number
}

/** tilted 51-55 degrees, a little off-axis, like the reference plates */
export const HOME: CamState = { tx: 0, tz: 0, radius: 1300, phi: 0.86, theta: -0.18 }

export function lonToX(lon: number): number {
  const m = db.meta!
  const [x0] = m.bbox
  return ((lon - x0) / m.cellSizeDeg - m.cols / 2) * CELL_KM
}

export function latToZ(lat: number): number {
  const m = db.meta!
  const [, , , y1] = m.bbox
  return ((y1 - lat) / m.cellSizeDeg - m.rows / 2) * CELL_KM
}

export function boundsToWorld(bbox: number[]) {
  const xa = lonToX(bbox[0])
  const xb = lonToX(bbox[2])
  const za = latToZ(bbox[3])
  const zb = latToZ(bbox[1])
  return {
    cx: (xa + xb) / 2,
    cz: (za + zb) / 2,
    w: Math.abs(xb - xa),
    h: Math.abs(zb - za),
  }
}

/**
 * Distance that fits a w x h patch in the view. The vertical field of view is
 * fixed, so on a portrait stage the horizontal field is much narrower and the
 * width becomes the binding constraint - that is why the map used to spill off
 * both sides of a phone.
 */
function fitRadius(w: number, h: number, fovDeg: number, aspect: number, pad: number) {
  const halfV = Math.tan(((fovDeg * Math.PI) / 180) / 2)
  const halfH = halfV * Math.max(aspect, 0.25)
  const vertical = h / 2 / halfV
  const horizontal = w / 2 / halfH
  return THREE.MathUtils.clamp(Math.max(vertical, horizontal) * pad, 240, 3600)
}

/** the country at rest, framed for the current stage aspect */
export function homeFor(aspect: number): CamState {
  const meta = db.meta
  if (!meta) return HOME
  const { w, h } = boundsToWorld(meta.bbox)
  // the tilt foreshortens depth, so the country needs less height than its bbox
  return { ...HOME, radius: fitRadius(w, h * 0.75, 28, aspect, 1.28) }
}

export function fitState(bbox: number[], fovDeg: number, aspect = 1): CamState {
  const { cx, cz, w, h } = boundsToWorld(bbox)
  const radius = fitRadius(Math.max(w, 60), Math.max(h * 0.8, 60), fovDeg, aspect, 1.16)
  return { tx: cx, tz: cz, radius, phi: 0.82, theta: -0.18 }
}

export function applyCamera(camera: THREE.PerspectiveCamera, s: CamState) {
  const y = s.radius * Math.sin(s.phi)
  const r = s.radius * Math.cos(s.phi)
  camera.position.set(s.tx + r * Math.sin(s.theta), y, s.tz + r * Math.cos(s.theta))
  camera.lookAt(s.tx, 0, s.tz)
}
