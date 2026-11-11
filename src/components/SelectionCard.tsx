import { db, formatValue, layerDef, type RegionStats } from '../lib/data'
import { useStore } from '../store'

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-label !text-[11px] !tracking-[0.22em] text-[#5f5f5f]">{label}</p>
      <p className="mt-1 font-serif text-[19px] leading-tight text-ink">{value}</p>
    </div>
  )
}

export default function SelectionCard() {
  const divisionId = useStore((s) => s.selectedDivision)
  const districtId = useStore((s) => s.selectedDistrict)
  const active = useStore((s) => s.activeLayer)
  const clear = useStore((s) => s.clearSelection)

  if (!divisionId && !districtId) return null

  const layer = layerDef(active)
  const district = districtId
    ? db.regions.flatMap((v) => v.districts).find((d) => d.id === districtId)
    : null
  const division = divisionId ? db.regions.find((v) => v.id === divisionId) : null
  const target = district ?? division
  if (!target) return null

  const stats = target.stats?.[active] as RegionStats | undefined
  const population = (division ?? target).stats?.population?.population ?? 0
  const area = target.areaKm2
  const peak = stats?.max ?? null
  const mean = stats?.mean ?? null
  const isCat = layer.type === 'categorical'

  return (
    <div className="pointer-events-auto absolute bottom-24 left-5 z-30 w-[min(320px,calc(100vw-2.5rem))] md:bottom-8 md:left-auto md:right-6">
      <div className="stat-rise rounded-card border border-line bg-cream/90 p-5 shadow-[0_30px_70px_-40px_rgba(31,122,84,0.45)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-label !text-[11px] !tracking-[0.24em] text-green-700">
              {district ? division?.name : 'Division'}
            </p>
            <h3 className="mt-1 font-serif text-[26px] leading-none text-ink">{target.name}</h3>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="mono-label -mt-1 rounded-full border border-line px-2 py-1 !text-[11px] !tracking-[0.14em] text-[#5f5f5f] transition-colors duration-300 premium-ease hover:border-green-400 hover:text-green-700"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Cell
            label={isCat ? 'Dominant class' : `${layer.label} · mean`}
            value={isCat ? formatValue(layer, stats?.dominant ?? 0) : mean === null ? '—' : formatValue(layer, mean)}
          />
          {!isCat && <Cell label="Peak" value={peak === null ? '—' : formatValue(layer, peak)} />}
          <Cell label="Population" value={`${(population / 1e6).toFixed(1)} M`} />
          <Cell label="Area" value={`${Math.round(area).toLocaleString()} km²`} />
        </div>
      </div>
    </div>
  )
}
