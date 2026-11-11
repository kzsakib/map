import { useEffect, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { cellFromLonLat, db, districtAt, layerDef } from '../lib/data'
import { useStore } from '../store'
import { CELL_KM, heightFor } from './layers'

type Item = {
  name: string
  anchor: [number, number, number]
  label: [number, number, number]
  covered: boolean
}

export default function CityLabels() {
  const active = useStore((s) => s.activeLayer)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    const meta = db.meta
    const def = layerDef(active)
    const bin = db.bins.get(def.id)
    if (!meta || !bin || !db.regionsBin) {
      setItems([])
      return
    }

    const next = db.cities.map((city, idx) => {
      const centre = cellFromLonLat(city.lon, city.lat)
      let best = { q: 0, col: centre?.col ?? 0, row: centre?.row ?? 0 }
      if (centre) {
        const R = 14
        for (let r = Math.max(0, centre.row - R); r <= Math.min(meta.rows - 1, centre.row + R); r++) {
          for (let c = Math.max(0, centre.col - R); c <= Math.min(meta.cols - 1, centre.col + R); c++) {
            const q = bin[r * meta.cols + c] ?? 0
            if (q > best.q) best = { q, col: c, row: r }
          }
        }
      }
      const x = (best.col + 0.5 - meta.cols / 2) * CELL_KM
      const z = (best.row + 0.5 - meta.rows / 2) * CELL_KM
      const h = heightFor(def, best.q) + 1.5
      const side = idx % 2 === 0 ? 1 : -1
      const cityDistrict = districtAt(city.lon, city.lat)
      const covered =
        !selectedDivision && !selectedDistrict
          ? true
          : selectedDistrict
            ? cityDistrict === selectedDistrict
            : db.regions
                .find((v) => v.id === selectedDivision)
                ?.districts.some((d) => d.id === cityDistrict) ?? false
      return {
        name: city.name,
        anchor: [x, h, z] as [number, number, number],
        label: [x + side * 30, h + 15, z - 8] as [number, number, number],
        covered,
      }
    })
    setItems(next)
  }, [active, selectedDivision, selectedDistrict])

  return (
    <group>
      {items
        .filter((i) => i.covered)
        .map((item) => (
          <group key={item.name}>
            <Line
              points={[item.anchor, item.label]}
              color="#5c1f38"
              lineWidth={0.75}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
            <Html
              position={item.label}
              center
              zIndexRange={[9, 0]}
              style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
            >
              <span className="font-serif text-[13px] italic text-[#3b0a1e] drop-shadow-[0_1px_0_rgba(252,251,249,0.9)] md:text-[14px]">
                {item.name}
              </span>
            </Html>
          </group>
        ))}
    </group>
  )
}
