import { useState } from 'react'
import { db, formatValue, layerDef, type Division, type RegionStats } from '../lib/data'
import { useStore } from '../store'
import CountUp from './reactbits/CountUp'

function digits(layerId: string) {
  const l = layerDef(layerId)
  if (l.type === 'categorical') return 0
  if (l.unit.includes('µg')) return 1
  if (l.unit.includes('people')) return 0
  return 0
}

function StatCell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mono-label !text-[8.5px] !tracking-[0.22em] text-ink/35">{label}</p>
      <p className="mt-1.5 font-serif text-[20px] leading-tight text-ink">{children}</p>
    </div>
  )
}

function Row({ division, open, onToggle }: { division: Division; open: boolean; onToggle: () => void }) {
  const active = useStore((s) => s.activeLayer)
  const setSelection = useStore((s) => s.setSelection)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const layer = layerDef(active)
  const stats: RegionStats | undefined = division.stats[active]
  const isSelected = selectedDivision === division.id
  const d = digits(active)
  const isCat = layer.type === 'categorical'

  return (
    <div className="border-b border-line">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`division-${division.id}`}
          onClick={onToggle}
          className="group flex w-full items-baseline justify-between gap-4 py-5 text-left"
        >
          <span
            className={`font-serif text-[26px] leading-none transition-colors duration-500 premium-ease md:text-[30px] ${
              open || isSelected ? 'text-ink' : 'text-neutral-400 group-hover:text-ink'
            }`}
          >
            {division.name}
            <span className="mono-label ml-3 align-middle !text-[8.5px] !tracking-[0.2em] text-ink/30">
              {division.districts.length} districts
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`mono-label shrink-0 !text-[11px] text-ink/40 transition-transform duration-500 premium-ease ${
              open ? 'rotate-45' : ''
            }`}
          >
            +
          </span>
        </button>
      </h3>

      <div
        id={`division-${division.id}`}
        hidden={!open}
        className="pb-7"
      >
        <div className="grid grid-cols-3 gap-x-5 gap-y-6">
          <StatCell label={isCat ? 'Dominant class' : layer.label}>
            {isCat ? (
              <span className="text-[18px]">{formatValue(layer, stats?.dominant ?? 0)}</span>
            ) : (
              <CountUp value={stats?.mean ?? 0} decimals={d} />
            )}
          </StatCell>
          {!isCat && (
            <StatCell label="Peak">
              <CountUp value={stats?.max ?? 0} decimals={d} />
            </StatCell>
          )}
          <StatCell label="Population">
            <CountUp value={(division.stats.population?.population ?? 0) / 1e6} decimals={1} suffix=" M" />
          </StatCell>
          <StatCell label="Area">
            <CountUp value={division.areaKm2} suffix=" km²" />
          </StatCell>
          <StatCell label="Rivers">
            <CountUp value={division.stats.rivers?.riverKm ?? 0} suffix=" km" />
          </StatCell>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-2 gap-y-2">
          {division.districts.map((district) => {
            const on = selectedDistrict === district.id
            return (
              <button
                key={district.id}
                type="button"
                onClick={() =>
                  setSelection({ district: on ? null : district.id, division: on ? null : null })
                }
                className={`mono-tight rounded-full border px-2.5 py-1 !text-[10px] !tracking-[0.14em] transition-all duration-500 premium-ease ${
                  on
                    ? 'border-accent bg-accent text-cream'
                    : 'border-line text-ink/55 hover:border-accent/40 hover:text-accent'
                }`}
              >
                [{district.name}]
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setSelection({ division: isSelected ? null : division.id, district: null })}
          className="mono-label mt-6 inline-flex items-center gap-2 !text-[9px] !tracking-[0.24em] text-accent"
        >
          {isSelected ? 'Clear division' : 'Fly to division'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

export default function Accordion() {
  const [open, setOpen] = useState<number | null>(db.regions[0]?.id ?? null)

  return (
    <div>
      {db.regions.map((division) => (
        <Row
          key={division.id}
          division={division}
          open={open === division.id}
          onToggle={() => setOpen(open === division.id ? null : division.id)}
        />
      ))}
    </div>
  )
}
