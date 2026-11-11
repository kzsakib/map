import { useLayoutEffect, useRef, useState } from 'react'
import { db } from '../lib/data'
import { useStore } from '../store'

export default function LayerTabs() {
  const active = useStore((s) => s.activeLayer)
  const setLayer = useStore((s) => s.setLayer)
  const layers = db.layers
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [bar, setBar] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const measure = () => {
      const idx = layers.findIndex((l) => l.id === active)
      const el = refs.current[idx]
      if (!el) return
      setBar({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, layers])

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + layers.length) % layers.length
    setLayer(layers[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Data layers"
      className="relative -mx-1 flex flex-wrap gap-1 pb-3"
    >
      {layers.map((layer, i) => {
        const isActive = layer.id === active
        return (
          <button
            key={layer.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => setLayer(layer.id)}
            className={`mono-label whitespace-nowrap rounded-full px-3 py-2 !text-[11px] !tracking-[0.22em] transition-colors duration-500 premium-ease ${
              isActive ? 'bg-ink/[0.055] text-ink' : 'text-[#5f5f5f] hover:text-ink'
            }`}
          >
            {layer.label.replace(' & ', ' / ')}
          </button>
        )
      })}
      <span
        aria-hidden="true"
        className="absolute bottom-0 h-[2px] rounded-full bg-accent transition-all duration-[600ms] premium-ease"
        style={{ left: bar.left + 10, width: Math.max(0, bar.width - 20) }}
      />
    </div>
  )
}
