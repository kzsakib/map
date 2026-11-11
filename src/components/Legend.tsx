import { formatValue, layerDef } from '../lib/data'
import { useStore } from '../store'

export default function Legend() {
  const active = useStore((s) => s.activeLayer)
  const dataLoaded = useStore((s) => s.dataLoaded)
  if (!dataLoaded) {
    return <div className="mt-4 h-[58px] border-t border-line pt-4" aria-hidden="true" />
  }
  const layer = layerDef(active)
  const gradient = `linear-gradient(90deg, ${layer.ramp.join(', ')})`

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-start md:justify-between">
      {layer.type === 'categorical' && layer.classes ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {layer.classes.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: c.color }}
                aria-hidden="true"
              />
              <span className="mono-label !text-[9px] !tracking-[0.2em] text-ink/55">{c.label}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="mono-label !text-[9px] !tracking-[0.2em] text-ink/45">
              {formatValue(layer, layer.min)}
            </span>
            <span
              className="h-1.5 flex-1 rounded-full"
              style={{ background: gradient }}
              aria-hidden="true"
            />
            <span className="mono-label !text-[9px] !tracking-[0.2em] text-ink/45">
              {formatValue(layer, layer.max)}
            </span>
          </div>
          <p className="mono-label mt-2 !text-[9px] !tracking-[0.2em] text-ink/35">{layer.unit}</p>
        </div>
      )}

      <p className="mono-label max-w-[280px] !text-[8.5px] !tracking-[0.18em] text-ink/35 md:text-right">
        {layer.source}
        <span className="mt-0.5 block text-ink/25">
          {layer.license} · {layer.year}
        </span>
      </p>
    </div>
  )
}
