import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { db } from '../lib/data'

/** soft cream puff drawn once into a canvas, then reused by every sprite */
function puffTexture(): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  if (ctx) {
    const blobs = [
      [0.5, 0.55, 0.30],
      [0.36, 0.52, 0.22],
      [0.64, 0.5, 0.20],
      [0.5, 0.42, 0.18],
      [0.42, 0.62, 0.16],
      [0.6, 0.62, 0.14],
    ]
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S)
      g.addColorStop(0, 'rgba(255,253,250,0.95)')
      g.addColorStop(0.55, 'rgba(255,252,248,0.55)')
      g.addColorStop(1, 'rgba(255,252,248,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, S, S)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

// small, high and off to the corners: a cloud must never sit on a label
const CLOUDS = [
  { x: -430, z: -170, y: 235, s: 150, speed: 0.9 },
  { x: 440, z: 120, y: 260, s: 180, speed: 0.7 },
  { x: -60, z: 430, y: 245, s: 140, speed: 1.15 },
]

/** Clouds sit above the highest ridge and drift slowly, 60 s across the plate. */
export default function Clouds({ on }: { on: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const tex = useMemo(() => puffTexture(), [])
  const group = useRef<THREE.Group>(null)
  const drift = useRef(0)

  useEffect(() => () => tex.dispose(), [tex])

  useFrame((_, delta) => {
    if (!on || !group.current) return
    drift.current = (drift.current + delta) % 60
    group.current.children.forEach((child, i) => {
      const c = CLOUDS[i]
      // a 60 s loop: drift across and wrap, always over the plate
      const t = ((drift.current / 60) * (c.speed || 1)) % 1
      child.position.x = c.x + t * 420
      if (child.position.x > db.meta!.cols * 0.62) child.position.x -= 420
    })
    invalidate()
  })

  if (!on) return null

  return (
    <group ref={group}>
      {CLOUDS.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.42, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.62} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}
