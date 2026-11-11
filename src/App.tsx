import { useEffect, useState } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import MapStage from './stage/MapStage'
import Footer from './components/Footer'
import BlobCursor from './components/reactbits/BlobCursor'
import Loader from './components/Loader'
import { initData, preloadLayers } from './lib/data'
import { initScroll } from './lib/scroll'
import { useStore } from './store'

export default function App() {
  const setDataLoaded = useStore((s) => s.setDataLoaded)
  // the blob shrinks over the map so it never hides the cell you are aiming at
  const [overMap, setOverMap] = useState(false)

  useEffect(() => {
    const stage = document.getElementById('map')
    if (!stage) return
    const onMove = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const inside = !!target && (stage === target || stage.contains(target))
      setOverMap((prev) => (prev === inside ? prev : inside))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    initScroll()
    let alive = true
    initData()
      .then(() => {
        if (!alive) return
        setDataLoaded(true)
        // warm the other seven layers once the first is drawable
        preloadLayers()
      })
      .catch((err) => {
        console.error('data load failed', err)
      })
    return () => {
      alive = false
    }
  }, [setDataLoaded])

  return (
    <div className="relative min-h-screen bg-cream">
      <Loader />
      <Header />
      <main>
        <Hero />
        <MapStage />
      </main>
      <Footer />

      {/*
        Site-wide blob cursor. It sits above every section and control so it can
        invert them, and the blend lives on this fixed wrapper: a z-indexed
        wrapper forms a stacking context, so a child with mix-blend-mode would
        have an empty backdrop and paint flat white.
      */}
      <div
        className="blob-host pointer-events-none fixed inset-0 z-[70] hidden md:block"
        style={{ mixBlendMode: 'difference' }}
        aria-hidden="true"
      >
        <BlobCursor
          material="ink"
          color="#ffffff"
          blend="normal"
          size={overMap ? 44 : 88}
          morph={0.35}
          morphSpeed={0.35}
          lag={0.6}
          stretch={0.55}
          wobble={0.9}
          splash
          splashSize={0.4}
          hideCursor
        />
      </div>
    </div>
  )
}
