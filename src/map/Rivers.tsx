import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import { db } from '../lib/data'
import { prefersReducedMotion, useStore } from '../store'
import { lonToX, latToZ } from './camera'

const RIVER_Y = 1.4

const BINS = [
  { min: 8000, width: 4.8, color: '#3730a3', opacity: 0.97 },
  { min: 2000, width: 3.0, color: '#4f46e5', opacity: 0.92 },
  { min: 0, width: 1.6, color: '#6d6cb4', opacity: 0.82 },
]

type LineMat = LineMaterial & { dashOffset?: number }

export default function Rivers() {
  const { size, invalidate } = useThree()
  const active = useStore((s) => s.activeLayer)
  const reduced = prefersReducedMotion()

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
      mat.dashSize = 3
      mat.gapSize = 7
      mat.dashScale = 1.2
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
      mat.color.set(on ? BINS[i].color : '#8b8aa8')
      mat.opacity = on ? BINS[i].opacity : 0.22
      mat.linewidth = on ? BINS[i].width : Math.max(0.8, BINS[i].width * 0.6)
      mat.transparent = true
      const dashed = on && !reduced
      mat.dashed = dashed
      if (dashed) mat.defines.USE_DASH = ''
      else delete mat.defines.USE_DASH
      mat.needsUpdate = true
    })
    invalidate()
  }, [active, lines, reduced, size, invalidate])

  useFrame((_, delta) => {
    if (active !== 'rivers' || reduced) return
    lines.forEach(({ mat }) => {
      mat.dashOffset = (mat.dashOffset ?? 0) - delta * 0.45
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
