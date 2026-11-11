import { formatValue, layerDef } from '../lib/data'
import { rampOf } from '../lib/look'
import { useStore } from '../store'

export default function Legend() {
  const active = useStore((s) => s.activeLayer)
  const dataLoaded = useStore((s) => s.dataLoaded)
  if (!dataLoaded) return <div className="h-[86px]" aria-hidden="true" />

  const layer = layerDef(active)
  const gradient = `linear-gradient(90deg, ${rampOf(layer).join(', ')})`

  return (
    <div className="w-full">
      <p className="mono-label !text-[8.5px] !tracking-[0.24em] text-ink/45">
        {layer.unit} · {layer.scale}
      </p>

      {layer.type === 'categorical' && layer.classes ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {layer.classes.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: c.color }} aria-hidden="true" />
              <span className="mono-label !text-[7.5px] !tracking-[0.16em] text-ink/50">{c.label}</span>
            </span>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: gradient }} aria-hidden="true" />
          <div className="mt-1.5 flex justify-between">
            <span className="mono-label !text-[8px] !tracking-[0.18em] text-ink/45">
              {formatValue(layer, layer.min)}
            </span>
            <span className="mono-label !text-[8px] !tracking-[0.18em] text-ink/45">
              {formatValue(layer, layer.max)}
            </span>
          </div>
        </>
      )}

      <div className="mt-3">
        <div className="relative h-[3px] w-[72px] border-x border-b border-ink/25" aria-hidden="true" />
        <div className="mt-1 flex w-[72px] justify-between">
          <span className="mono-label !text-[7px] !tracking-[0.16em] text-ink/35">0</span>
          <span className="mono-label !text-[7px] !tracking-[0.16em] text-ink/35">200 km</span>
        </div>
      </div>

      <p className="mono-label mt-3 !text-[7.5px] !tracking-[0.18em] text-ink/30">
        {layer.source}
        <span className="mt-0.5 block text-ink/25">
          {layer.year} · {layer.license}
        </span>
      </p>
    </div>
  )
}
