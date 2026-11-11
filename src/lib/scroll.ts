import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

export function initScroll(): Lenis {
  if (lenis) return lenis

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  lenis = new Lenis({ lerp: reduced ? 1 : 0.1 })

  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis?.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // images / fonts settle after first paint: refresh once they do
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })

  return lenis
}

export function scrollToSection(target: string) {
  if (!lenis) {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' })
    return
  }
  lenis.scrollTo(target, { offset: -72, duration: 1.4 })
}
