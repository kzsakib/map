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
export const HOME: CamState = { tx: 0, tz: 0, radius: 1520, phi: 0.88, theta: -0.18 }

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

export function fitState(bbox: number[], fovDeg: number): CamState {
  const { cx, cz, w, h } = boundsToWorld(bbox)
  const span = Math.max(w, h, 30)
  const radius = THREE.MathUtils.clamp(
    (span / 2 / Math.tan((fovDeg * Math.PI) / 180 / 2)) * 1.85,
    360,
    2400,
  )
  return { tx: cx, tz: cz, radius, phi: 0.86, theta: -0.18 }
}

export function applyCamera(camera: THREE.PerspectiveCamera, s: CamState) {
  const y = s.radius * Math.sin(s.phi)
  const r = s.radius * Math.cos(s.phi)
  camera.position.set(s.tx + r * Math.sin(s.theta), y, s.tz + r * Math.cos(s.theta))
  camera.lookAt(s.tx, 0, s.tz)
}
