import { useEffect, useRef } from 'react'

type Props = {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}

const fmt = (n: number, d: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * React Bits "CountUp" (reactbits.dev), copied in and adapted: counts when the
 * number scrolls into view and re-counts whenever the value changes.
 */
export default function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1.5,
  className = '',
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let started = false

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = `${prefix}${fmt(value, decimals)}${suffix}`
      return
    }

    const run = () => {
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / (duration * 1000))
        const eased = 1 - Math.pow(1 - p, 4)
        el.textContent = `${prefix}${fmt(value * eased, decimals)}${suffix}`
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started) {
          started = true
          run()
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)

    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, decimals, prefix, suffix, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {fmt(value, decimals)}
      {suffix}
    </span>
  )
}
