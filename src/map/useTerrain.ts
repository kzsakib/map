import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { loadTerrain, type Terrain } from './terrain'

/** Shared, cached terrain decode; wakes the demand frameloop when it lands. */
export function useTerrain(): Terrain | null {
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let alive = true
    loadTerrain()
      .then((t) => {
        if (alive) {
          setTerrain(t)
          invalidate()
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [invalidate])

  return terrain
}
