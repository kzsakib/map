import { useEffect } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import MapStage from './stage/MapStage'
import Footer from './components/Footer'
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
    </div>
  )
}
