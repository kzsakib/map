import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import { db } from '../lib/data'
import { useStore } from '../store'
import { lonToX, latToZ } from './camera'

const RIVER_Y = 1.4

// the rivers layer leans on these lines, so they get a touch more weight: a
// deep trunk, a mid channel and pale distributaries
const BINS = [
  { min: 8000, width: 6, color: '#0b2f24', opacity: 1 },
  { min: 2000, width: 4, color: '#1f7a54', opacity: 1 },
  { min: 0, width: 2.2, color: '#6fcf9b', opacity: 0.9 },
]

type LineMat = LineMaterial & { dashOffset?: number }

export default function Rivers() {
  const { size, invalidate } = useThree()
  const active = useStore((s) => s.activeLayer)

  const lines = useMemo(() => {
    const features = db.rivers?.features ?? []
    const buckets: number[][][] = BINS.map(() => [])
    for (const f of features) {
      const q = f.properties.q
      const idx = q >= BINS[0].min ? 0 : q >= BINS[1].min ? 1 : 2
      const coords = f.geometry.coordinates
      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i]
        const b = coords[i + 1]
        buckets[idx].push([
          lonToX(a[0]), RIVER_Y, latToZ(a[1]),
          lonToX(b[0]), RIVER_Y, latToZ(b[1]),
        ])
      }
    }
    return buckets.map((segs, i) => {
      const positions = new Float32Array(segs.length * 6)
      segs.forEach((s, k) => positions.set(s, k * 6))
      const geo = new LineSegmentsGeometry()
      geo.setPositions(positions)
      const mat = new LineMaterial({
        linewidth: BINS[i].width,
        transparent: true,
        opacity: 0.3,
        dashed: false,
        depthWrite: false,
      })
      mat.color.set(BINS[i].color)
      // long dashes with a short gap: the channel reads as one continuous river
      // rather than the string of dots the old 3.4/8.5 split produced
      mat.dashSize = 9
      mat.gapSize = 3.2
      mat.dashScale = 1.05
      const line = new LineSegments2(geo, mat)
      line.computeLineDistances()
      line.frustumCulled = false
      return { line, mat: mat as LineMat }
    })
  }, [])

  useEffect(() => {
    const on = active === 'rivers'
    lines.forEach(({ mat }, i) => {
      mat.resolution.set(size.width, size.height)
      mat.color.set(on ? BINS[i].color : '#bfe8d0')
      mat.opacity = on ? BINS[i].opacity : 0.22
      mat.linewidth = on ? BINS[i].width : Math.max(0.8, BINS[i].width * 0.6)
      mat.transparent = true
      const dashed = on
      mat.dashed = dashed
      if (dashed) mat.defines.USE_DASH = ''
      else delete mat.defines.USE_DASH
      mat.needsUpdate = true
    })
    invalidate()
  }, [active, lines, size, invalidate])

  // flow at 30fps: the drift is slow enough that half the frames read the same,
  // and every frame here costs a full-canvas render
  const acc = useRef(0)
  useFrame((_, delta) => {
    if (active !== 'rivers') return
    acc.current += delta
    if (acc.current < 1 / 30) return
    const step = acc.current
    acc.current = 0
    lines.forEach(({ mat }) => {
      mat.dashOffset = (mat.dashOffset ?? 0) - step * 0.32
    })
    invalidate()
  })

  useEffect(() => {
    return () => {
      lines.forEach(({ line, mat }) => {
        line.geometry.dispose()
        mat.dispose()
      })
    }
  }, [lines])

  return (
    <group position={[0, 0.35, 0]}>
      {lines.map(({ line }, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
