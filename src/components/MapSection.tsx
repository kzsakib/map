import { useEffect } from 'react'
import DensityMap from '../map/DensityMap'
import { layerDef, selectionName } from '../lib/data'
import { useStore } from '../store'
import Accordion from './Accordion'
import LayerTabs from './LayerTabs'
import Legend from './Legend'
import Reveal from './Reveal'
import { scrollToSection } from '../lib/scroll'

export default function MapSection() {
  const active = useStore((s) => s.activeLayer)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const hovered = useStore((s) => s.hovered)
  const clearSelection = useStore((s) => s.clearSelection)
  const dataLoaded = useStore((s) => s.dataLoaded)
  const layer = dataLoaded ? layerDef(active) : null
  const selected = selectedDivision || selectedDistrict

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

  return (
    <section id="map" className="relative border-t border-line pb-24 pt-16 md:pt-24">
      <div className="mx-auto max-w-[1500px] px-5 md:px-10">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mono-label text-ink/35">Chapter one · the landscape</p>
              <h2 className="serif-display mt-4 text-[clamp(2.6rem,6vw,5rem)]">
                Explore the <span className="italic text-accent">delta</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => scrollToSection('#regions')}
              className="mono-label group inline-flex items-center gap-2 !text-[9.5px] !tracking-[0.26em] text-ink/50 transition-colors duration-500 premium-ease hover:text-accent"
            >
              Explore the regions
              <span
                aria-hidden="true"
                className="transition-transform duration-500 premium-ease group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <LayerTabs />

            <div className="map-frame relative mt-2 h-[56vh] min-h-[360px] overflow-hidden rounded-card border border-line bg-cream md:h-[62vh] lg:h-[calc(100vh-17rem)]">
              <DensityMap />

              {/* map chrome */}
              <div className="pointer-events-none absolute left-5 top-4 z-10">
                <p className="mono-label !text-[8.5px] !tracking-[0.28em] text-ink/45">
                  Bangladesh · {layer?.label ?? '—'}
                </p>
                <p className="mono-label mt-1 !text-[8px] !tracking-[0.22em] text-ink/25">
                  {selected ? selectionName(null, selectedDistrict) : 'Full country'} · 1 km grid
                </p>
              </div>

              <div className="pointer-events-none absolute right-5 top-4 z-10 text-right">
                <p className="mono-label !text-[8.5px] !tracking-[0.22em] text-ink/40">
                  {hovered ? `${Math.abs(hovered.lat).toFixed(2)}° N` : '23.81° N'}
                </p>
                <p className="mono-label mt-1 !text-[8.5px] !tracking-[0.22em] text-ink/40">
                  {hovered ? `${hovered.lon.toFixed(2)}° E` : '90.41° E'}
                </p>
              </div>

              {selected && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-line bg-cream/95 px-3 py-1.5 backdrop-blur-sm transition-colors duration-500 premium-ease hover:border-accent/40"
                >
                  <span className="mono-label !text-[8.5px] !tracking-[0.2em] text-ink/60">
                    Reset view
                  </span>
                  <span aria-hidden="true" className="text-ink/40">
                    ×
                  </span>
                </button>
              )}

              <div className="pointer-events-none absolute bottom-4 left-5 z-10">
                <p className="mono-label !text-[8px] !tracking-[0.22em] text-ink/30">
                  Drag to orbit · scroll to zoom · click a district
                </p>
              </div>

              <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-px bg-ink/20" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-px bg-ink/20" />
            </div>

            <Legend />
          </div>

          <div id="regions" className="relative">
            <div className="sticky top-24 z-10 mb-2 flex items-end justify-between gap-6 bg-cream pb-4">
              <h3 className="serif-display text-[clamp(1.9rem,3.4vw,2.9rem)]">
                Explore the <span className="italic text-accent">Regions</span>
              </h3>
              <button
                type="button"
                onClick={clearSelection}
                className="mono-label whitespace-nowrap !text-[9px] !tracking-[0.24em] text-ink/45 transition-colors duration-500 premium-ease hover:text-accent"
              >
                Reset view →
              </button>
            </div>

            <p className="mb-6 max-w-sm text-sm leading-relaxed text-ink/55">
              Eight divisions, sixty-four districts. Open one to read its numbers for the
              layer you are looking at — the map follows every choice.
            </p>

            {dataLoaded ? <Accordion /> : <div className="h-40" aria-hidden="true" />}
          </div>
        </div>
      </div>
    </section>
  )
}
