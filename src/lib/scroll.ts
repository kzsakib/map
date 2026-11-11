import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

/**
 * Motion is always on for every visitor: there are no reduced-motion branches
 * anywhere in the site, by request.
 */
export function initScroll(): Lenis {
  if (lenis) return lenis

  lenis = new Lenis({
    lerp: 0.1,
    smoothWheel: true,
    wheelMultiplier: 1,
    // Lenis defaults respectReducedMotion to true and quietly falls back to
    // native scrolling when the OS asks for less motion (common on Windows).
    // Smooth scroll is on for everyone here, so switch that off explicitly.
    respectReducedMotion: false,
    autoRaf: false,
  })

  // belt and braces: if a future Lenis default slips a non-smoothing lerp in,
  // put it back rather than silently losing the effect
  if (lenis.options && lenis.options.lerp === 1) lenis.options.lerp = 0.1

  lenis.start()

  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis?.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  document.documentElement.classList.add('lenis', 'lenis-smooth')

  // fonts / images settle after first paint: remeasure once they do
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })

  return lenis
}

export function getLenis(): Lenis | null {
  return lenis
}

/** stop the page while an overlay (command palette) is open */
export function stopScroll(): void {
  lenis?.stop()
}

export function startScroll(): void {
  lenis?.start()
}

/** call after a layout change so pinned/measured sections stay honest */
export function refreshScroll(): void {
  ScrollTrigger.refresh()
}

export function scrollToSection(target: string) {
  if (!lenis) {
    document.querySelector(target)?.scrollIntoView()
    return
  }
  lenis.scrollTo(target, {
    offset: -72,
    duration: 1.4,
    easing: (t: number) => 1 - Math.pow(1 - t, 4),
  })
}
