import { useEffect, useState } from 'react'
import { useStore } from '../store'

/**
 * First-load screen. The eight grids are ~2.3 MB, so the map needs a beat
 * before it can draw anything; this covers that beat instead of showing an
 * empty stage. It also releases itself on a timer, so a failed fetch can never
 * trap the page behind it.
 */
export default function Loader() {
  const dataLoaded = useStore((s) => s.dataLoaded)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  // leave once the data is in, or after a failsafe wait
  useEffect(() => {
    const t = window.setTimeout(() => setLeaving(true), dataLoaded ? 260 : 11000)
    return () => window.clearTimeout(t)
  }, [dataLoaded])

  // unmount only after the fade has played out
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setGone(true), 900)
    return () => window.clearTimeout(t)
  }, [leaving])

  if (gone) return null

  return (
    <div
      className={`loader fixed inset-0 z-[120] flex flex-col items-center justify-center bg-cream px-6 ${
        leaving ? 'loader-out' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <p
        className="loader-word mono-label !text-[11px] !tracking-[0.34em] text-green-700"
        style={{ animationDelay: '80ms' }}
      >
        Discover Bangladesh
      </p>

      <h1
        className="loader-word mt-5 font-serif text-[clamp(2rem,6vw,3.2rem)] italic leading-none text-ink"
        style={{ animationDelay: '200ms' }}
      >
        Reading the delta
      </h1>

      <div className="mt-9 h-px w-[min(300px,62vw)] overflow-hidden bg-line">
        <span className="loader-fill block h-px w-full origin-left bg-green-700" />
      </div>

      <p
        className="loader-word mt-4 mono-label !text-[11px] !tracking-[0.26em] text-[#4a4a4a]"
        style={{ animationDelay: '320ms' }}
      >
        {dataLoaded ? 'Ready' : 'Eight layers · 64 districts · 1 km grid'}
      </p>
    </div>
  )
}
