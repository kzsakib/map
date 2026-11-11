import { useEffect, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { cellFromLonLat, db, districtAt, layerDef } from '../lib/data'
import { useStore } from '../store'
import { CELL_KM, heightFor } from './layers'

/** hand-tuned spread so the two Khulna-division labels never sit on top of each other */
const OFFSETS: Record<string, [number, number]> = {
  Barishal: [46, 34],
  Khulna: [40, -16],
  Rajshahi: [-46, -10],
  Rangpur: [-30, -34],
  Sylhet: [44, -10],
  Mymensingh: [-6, -30],
  Dhaka: [36, -22],
  Chattogram: [44, 10],
}

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
      const off = OFFSETS[city.name]
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
        label: [x + (off ? off[0] : side * 30), h + (off ? off[1] : 15), z - 8] as [
          number,
          number,
          number,
        ],
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
              color="#171717"
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
              <span className="whitespace-nowrap rounded-[2px] bg-cream/70 px-1 font-serif text-[15px] italic text-ink [text-shadow:0_0_10px_rgba(252,251,249,0.9)] md:text-[16px]">
                {item.name}
              </span>
            </Html>
          </group>
        ))}
    </group>
  )
}
