import { useEffect, useMemo, useRef, useState } from 'react'
import { db, formatValue, layerDef, type RegionStats } from '../lib/data'
import { useStore } from '../store'

type Row = {
  id: number
  name: string
  parent: string
  kind: 'division' | 'district'
  mean: number | null
}

const ALIASES: Record<string, string> = {
  chittagong: 'chattogram',
  barisal: 'barishal',
  comilla: 'cumilla',
  jessore: 'jashore',
  bogra: 'bogura',
  'cox bazar': 'coxs bazar',
  'coxs bazar': 'coxs bazar',
}

const normalise = (s: string) => s.toLowerCase().replace(/['’.-]/g, '').replace(/\s+/g, ' ').trim()

function matches(haystack: string, query: string) {
  const target = normalise(haystack)
  const q = normalise(query)
  if (!q) return true
  if (target.includes(q)) return true
  const alias = ALIASES[q]
  return alias ? target.includes(alias) : false
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setSelection = useStore((s) => s.setSelection)
  const active = useStore((s) => s.activeLayer)
  const dataLoaded = useStore((s) => s.dataLoaded)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const rows = useMemo<Row[]>(() => {
    if (!open) return []
    const out: Row[] = []
    for (const division of db.regions) {
      const stats = division.stats?.[active] as RegionStats | undefined
      out.push({
        id: division.id,
        name: division.name,
        parent: `${division.districts.length} districts`,
        kind: 'division',
        mean: stats?.mean ?? null,
      })
      for (const district of division.districts) {
        const dStats = district.stats?.[active] as RegionStats | undefined
        out.push({
          id: district.id,
          name: district.name,
          parent: division.name,
          kind: 'district',
          mean: dStats?.mean ?? null,
        })
      }
    }
    return out
    // dataLoaded belongs here: opening the palette mid-load used to memoise an
    // empty list and never refresh once the regions arrived
  }, [open, active, dataLoaded])

  const results = useMemo(() => {
    const list = rows.filter((r) => matches(r.name, query))
    return list.slice(0, 8)
  }, [rows, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const layer = layerDef(active)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(results.length - 1, c + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      } else if (e.key === 'Enter') {
        const row = results[cursor]
        if (!row) return
        e.preventDefault()
        setSelection(
          row.kind === 'division' ? { division: row.id, district: null } : { division: null, district: row.id },
        )
        onClose()
      } else if (e.key === 'Tab') {
        // keep focus inside the dialog
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>('input, button')
        if (!nodes || nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
      void layer
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, cursor, onClose, setSelection, active])

  if (!open) return null
  const layer = layerDef(active)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-ink/25 px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Find a district"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-card border border-line bg-cream shadow-[0_40px_90px_-40px_rgba(31,122,84,0.35)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="mono-label !text-[11px] !tracking-[0.24em] text-[#5f5f5f]">Find</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Division or district"
            aria-label="Search divisions and districts"
            className="flex-1 bg-transparent font-serif text-[20px] text-ink placeholder:text-[#5f5f5f] focus:outline-none"
          />
          <kbd className="mono-label rounded border border-line px-1.5 py-0.5 !text-[11px] !tracking-[0.2em] text-[#5f5f5f]">
            Esc
          </kbd>
        </div>

        <ul data-lenis-prevent className="max-h-[46vh] overflow-y-auto py-2" role="listbox" aria-label="Results">
          {results.length === 0 && (
            <li className="px-5 py-4 text-sm text-[#5f5f5f]">No region matches “{query}”.</li>
          )}
          {results.map((row, i) => (
            <li key={`${row.kind}-${row.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  setSelection(
                    row.kind === 'division'
                      ? { division: row.id, district: null }
                      : { division: null, district: row.id },
                  )
                  onClose()
                }}
                className={`flex w-full items-baseline justify-between gap-4 px-5 py-2.5 text-left transition-colors duration-300 premium-ease ${
                  i === cursor ? 'bg-green-50' : ''
                }`}
              >
                <span className="flex items-baseline gap-3">
                  <span className="font-serif text-[19px] text-ink">{row.name}</span>
                  <span className="mono-label !text-[11px] !tracking-[0.2em] text-[#5f5f5f]">{row.parent}</span>
                </span>
                <span className="mono-label !text-[11px] !tracking-[0.18em] text-[#5f5f5f]">
                  {row.mean === null ? '—' : formatValue(layer, row.mean)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
