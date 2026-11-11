import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

type Props = {
  text: string
  className?: string
  delay?: number
  stagger?: number
}

/**
 * React Bits "BlurText" (reactbits.dev), copied into the project and adapted:
 * each glyph animates from blurred + low to sharp, on the design system easing.
 */
export default function BlurText({ text, className = '', delay = 0, stagger = 0.035 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const chars = el.querySelectorAll<HTMLSpanElement>('[data-char]')
      if (false) {
        gsap.set(chars, { opacity: 1, y: 0, filter: 'none' })
        return
      }
      gsap.fromTo(
        chars,
        { opacity: 0, yPercent: 34, filter: 'blur(14px)' },
        {
          opacity: 1,
          yPercent: 0,
          filter: 'blur(0px)',
          duration: 1,
          ease: 'power4.out',
          stagger,
          delay,
        },
      )
    },
    { scope: ref },
  )

  return (
    <span ref={ref} className={className} aria-label={text}>
      {Array.from(text).map((char, i) => (
        <span key={`${char}-${i}`} data-char aria-hidden="true" className="inline-block">
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}
