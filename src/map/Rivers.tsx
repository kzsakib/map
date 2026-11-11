import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import { db } from '../lib/data'
import { useStore } from '../store'
import { lonToX, latToZ } from './camera'

const RIVER_Y = 1.4

// the rivers layer leans on these lines, so they get a touch more weight: a
// deep trunk, a mid channel and pale distributaries
const BINS = [
  { min: 8000, width: 5.4, color: '#0b2f24', opacity: 1 },
  { min: 2000, width: 3.6, color: '#175c40', opacity: 0.98 },
  { min: 0, width: 2, color: '#2f8a63', opacity: 0.9 },
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
      // solid channels: dash lengths are measured in world units, so at country
      // scale every dash collapsed into a dot and the network looked stippled
      mat.dashed = false
      delete mat.defines.USE_DASH
      mat.needsUpdate = true
    })
    invalidate()
  }, [active, lines, size, invalidate])

  // no dash drift any more: the lines are solid, so the stage can stay on its
  // demand loop and render only when something actually changes

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
