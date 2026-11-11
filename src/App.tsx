import { useEffect } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import MapStage from './stage/MapStage'
import Footer from './components/Footer'
import BlobCursor from './components/reactbits/BlobCursor'
import { initData } from './lib/data'
import { initScroll } from './lib/scroll'
import { useStore } from './store'

export default function App() {
  const setDataLoaded = useStore((s) => s.setDataLoaded)

  useEffect(() => {
    initScroll()
    let alive = true
    initData()
      .then(() => {
        if (alive) setDataLoaded(true)
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
        className="pointer-events-none fixed inset-0 z-[70] hidden md:block"
        style={{ mixBlendMode: 'difference' }}
        aria-hidden="true"
      >
        <BlobCursor
          material="ink"
          color="#ffffff"
          blend="normal"
          size={88}
          morph={0.35}
          morphSpeed={0.35}
          trail={12}
          lag={0.6}
          stretch={0.55}
          wobble={0.9}
          splash
          splashCount={10}
          splashSize={0.4}
          hideCursor
        />
      </div>
    </div>
  )
}
