import { useCallback, useEffect, useState } from 'react'
import DensityMap from '../map/DensityMap'
import { db, formatValue, layerDef, selectionName } from '../lib/data'
import { rampOf } from '../lib/look'
import { startScroll, stopScroll } from '../lib/scroll'
import { useStore } from '../store'
import RegionsDrawer from '../components/RegionsDrawer'
import CommandPalette from '../components/CommandPalette'
import SelectionCard from '../components/SelectionCard'

const SHORT: Record<string, string> = {
  population: 'Population',
  forest: 'Forest',
  elevation: 'Elevation',
  rivers: 'Rivers',
  landuse: 'Land use',
  rainfall: 'Rainfall',
  airquality: 'Air quality',
  flood: 'Flood',
}

const MODES = [
  { id: 'explore', label: 'Explore', ready: true },
  { id: 'story', label: 'Story', ready: false },
  { id: 'poster', label: 'Poster', ready: false },
] as const

type Mode = (typeof MODES)[number]['id']

export default function MapStage() {
  const dataLoaded = useStore((s) => s.dataLoaded)
  const active = useStore((s) => s.activeLayer)
  const setLayer = useStore((s) => s.setLayer)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  // no URL hash: the map must not rewrite the address bar on load or reload
  const [mode, setMode] = useState<Mode>('explore')

  const layer = dataLoaded ? layerDef(active) : null
  const layers = dataLoaded ? db.layers : []
  const selected = selectedDivision || selectedDistrict

  // freeze the page while the palette is open, then hand scrolling back
  useEffect(() => {
    if (palette) stopScroll()
    else startScroll()
  }, [palette])

  const close = useCallback(() => {
    setPalette(false)
    setDrawer(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPalette((v) => !v)
        return
      }
      if (typing) return
      // never swallow browser or OS shortcuts: Ctrl+R must reload the page, not
      // toggle the drawer, and the same goes for Cmd/Ctrl+anything else
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        if (palette) {
          setPalette(false)
          return
        }
        if (selected) {
          clearSelection()
          return
        }
        setDrawer(false)
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        setDrawer((v) => !v)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        setPalette(true)
        return
      }
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const found = MODES[Number(e.key) - 1]
        if (found.ready) setMode(found.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, selected, clearSelection])

  const onRailKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + layers.length) % layers.length
    setLayer(layers[next].id)
    const el = document.getElementById(`rail-${layers[next].id}`)
    el?.focus()
  }

  const gradient = layer ? `linear-gradient(90deg, ${rampOf(layer).join(', ')})` : ''

  return (
    <section
      id="map"
      className="relative h-[100svh] min-h-[560px] w-full overflow-hidden bg-cream"
    >
      <div className="absolute inset-0">
        <DensityMap />
      </div>

      {/* inset frame + fixed ticks */}
      <div className="pointer-events-none absolute inset-3 z-10 border border-ink/15 md:inset-6" aria-hidden="true">
        <div className="absolute left-[3%] top-1 flex gap-8">
          {['88°E', '90°E', '92°E'].map((t) => (
            <span key={t} className="mono-label bg-cream/80 !text-[11px] !tracking-[0.3em] text-[#5f5f5f]">
              {t}
            </span>
          ))}
        </div>
        <div className="absolute left-1 top-[16%] flex flex-col gap-5">
          {['26°N', '22°N'].map((t) => (
            <span
              key={t}
              className="mono-label bg-cream/80 !text-[11px] !tracking-[0.3em] text-[#5f5f5f]"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* mode switcher */}
      <div className="absolute left-1/2 top-[84px] z-30 -translate-x-1/2 md:left-auto md:right-10 md:top-[92px] md:translate-x-0">
        <div
          role="group"
          aria-label="View mode"
          className="inline-flex items-center gap-1 rounded-full border border-line bg-cream/70 p-1 backdrop-blur-md"
        >
          {MODES.map((m) => {
            const on = m.id === mode
            return (
              <button
                key={m.id}
                type="button"
                disabled={!m.ready}
                aria-disabled={!m.ready}
                onClick={() => m.ready && setMode(m.id)}
                className={`mono-label rounded-full px-3 py-1.5 !text-[11px] !tracking-[0.22em] transition-colors duration-500 premium-ease ${
                  on
                    ? 'bg-green-700 text-white'
                    : m.ready
                      ? 'text-[#4a4a4a] hover:text-ink'
                      : 'cursor-not-allowed text-[#5f5f5f]'
                }`}
              >
                {m.label}
                {!m.ready && <span className="ml-1 !text-[11px] text-[#5f5f5f]">Soon</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* title block */}
      {/* the phone screen is too narrow for a 300px title block: the hero already
          carries it, and the chip row names the layer */}
      <div className="pointer-events-none absolute right-4 top-[150px] z-20 hidden w-[300px] text-right md:right-10 md:block md:w-[340px]">
        <p className="mono-label !text-[11px] !tracking-[0.28em] text-[#5f5f5f]">Chapter one · the landscape</p>
        <h2 className="mt-3 font-serif text-[34px] leading-[1.05] text-ink md:text-[46px]">
          Bangladesh <span className="italic text-accent">in Relief</span>
        </h2>
        <p
          key={active}
          className="mt-2 font-serif text-[20px] italic text-muted md:text-[22px] animate-[rise-in_1s_cubic-bezier(0.22,1,0.36,1)_both]"
        >
          {layer ? layer.label : '—'}
        </p>
      </div>

      {/* layer rail */}
      <div className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <div
          role="radiogroup"
          aria-label="Data layers"
          className="flex flex-col gap-[18px] border-l border-line pl-4"
        >
          {layers.map((l, i) => {
            const on = l.id === active
            return (
              <button
                key={l.id}
                id={`rail-${l.id}`}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onKeyDown={(e) => onRailKey(e, i)}
                onClick={() => setLayer(l.id)}
                className={`mono-label relative whitespace-nowrap text-left !text-[11px] !tracking-[0.28em] transition-colors duration-500 premium-ease ${
                  on ? 'text-ink' : 'text-[#5f5f5f] hover:text-ink'
                }`}
              >
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[18px] top-1/2 h-3 w-[2px] -translate-y-1/2 bg-green-700"
                  />
                )}
                {SHORT[l.id] ?? l.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* legend */}
      <div
        className={`pointer-events-none absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-20 w-auto rounded-[14px] border border-line bg-cream/88 p-3 backdrop-blur-md md:bottom-10 md:left-10 md:right-auto md:w-[260px] md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none ${
          selected ? 'hidden md:block' : 'block'
        }`}
      >
        {layer && (
          <>
            <p className="mono-label !text-[11px] !tracking-[0.24em] text-[#5f5f5f]">
              {layer.unit} · {layer.scale}
            </p>
            {layer.type === 'categorical' && layer.classes ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {layer.classes.map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: c.color }} />
                    <span className="mono-label !text-[11px] !tracking-[0.16em] text-[#5f5f5f]">{c.label}</span>
                  </span>
                ))}
              </div>
            ) : (
              <>
                <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: gradient }} aria-hidden="true" />
                <div className="mt-1.5 flex justify-between">
                  <span className="mono-label !text-[11px] !tracking-[0.18em] text-[#5f5f5f]">
                    {formatValue(layer, layer.min)}
                  </span>
                  <span className="mono-label !text-[11px] !tracking-[0.18em] text-[#5f5f5f]">
                    {formatValue(layer, layer.max)}
                  </span>
                </div>
              </>
            )}
            <div className="mt-3 hidden items-end gap-2 md:flex" aria-hidden="true">
              <span className="h-2 w-px bg-ink/30" />
              <span className="h-2 flex-1 border-x border-b border-ink/20" style={{ height: 4 }} />
              <span className="h-2 w-px bg-ink/30" />
            </div>
            <div className="mt-1 hidden justify-between md:flex">
              <span className="mono-label !text-[11px] !tracking-[0.18em] text-[#5f5f5f]">0</span>
              <span className="mono-label !text-[11px] !tracking-[0.18em] text-[#5f5f5f]">200 km</span>
            </div>
            <p className="mono-label mt-3 hidden !text-[11px] !tracking-[0.18em] text-[#5f5f5f] md:block">
              {layer.source}
              <span className="mt-0.5 block text-[#5f5f5f]">
                {layer.year} · {layer.license}
              </span>
            </p>
          </>
        )}
      </div>

      {/* credit */}
      <p className="text-halo-soft pointer-events-none absolute bottom-10 right-4 z-20 hidden max-w-[260px] text-right mono-label !text-[11px] !tracking-[0.2em] text-[#4a4a4a] md:right-10 md:bottom-10 md:block">
        Visualised with three.js · Data: {layer?.source ?? '—'}
      </p>

      {/* dock */}
      <div className="absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-cream/75 p-1.5 backdrop-blur-md shadow-[0_24px_60px_-32px_rgba(31,122,84,0.45)]">
          {/* the drawer toggle is desktop-only at the screen edge, so the phone
              needs its own way into the regions list */}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="mono-label rounded-full px-3 py-2 !text-[11px] !tracking-[0.2em] text-[#4a4a4a] transition-colors duration-500 premium-ease hover:text-ink md:hidden"
          >
            Regions
          </button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="mono-label rounded-full px-4 py-2 !text-[11px] !tracking-[0.22em] text-[#4a4a4a] transition-colors duration-500 premium-ease hover:text-ink"
          >
            <span className="hidden md:inline">Search 64 districts</span>
            <span className="md:hidden">Search</span>
            <kbd className="ml-2 hidden rounded border border-line px-1 py-0.5 !text-[11px] text-[#5f5f5f] md:inline">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              clearSelection()
              setDrawer(false)
            }}
            className="mono-label rounded-full bg-ink px-4 py-2 !text-[11px] !tracking-[0.22em] text-cream transition-colors duration-500 premium-ease hover:bg-maroon-900"
          >
            Reset
          </button>
        </div>
      </div>

      {/* mobile chip row */}
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden ${
          selected ? 'hidden' : 'block'
        }`}
      >
        <div className="flex gap-1.5 px-4">
          {layers.map((l) => {
            const on = l.id === active
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                className={`mono-label whitespace-nowrap rounded-full border px-3 py-1.5 !text-[11px] !tracking-[0.2em] transition-colors duration-500 premium-ease ${
                  on ? 'border-green-700 bg-green-700 text-white' : 'border-line bg-cream/80 text-[#4a4a4a]'
                }`}
              >
                {SHORT[l.id]}
              </button>
            )
          })}
        </div>
      </div>

      <SelectionCard />
      <RegionsDrawer open={drawer} onToggle={() => setDrawer((v) => !v)} />
      <CommandPalette open={palette} onClose={close} />

      {selected && (
        <p className="pointer-events-none absolute left-4 top-[92px] z-20 hidden mono-label !text-[11px] !tracking-[0.24em] text-green-700 md:left-10 md:block">
          {selectionName(selectedDivision, selectedDistrict)}
        </p>
      )}
    </section>
  )
}
