import { useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(CustomEase, ScrollTrigger)
// the single easing of the design system: cubic-bezier(0.22, 1, 0.36, 1)
CustomEase.create('premium', 'M0,0 C0.22,1 0.36,1 1,1')

type Props = {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  as?: 'div' | 'section' | 'li' | 'article'
}

export default function Reveal({ children, className = '', delay = 0, y = 40, as = 'div' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        gsap.set(el, { opacity: 1, y: 0 })
        return
      }
      gsap.fromTo(
        el,
        { y, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          delay,
          ease: 'premium',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        },
      )
    },
    { scope: ref },
  )

  const Tag = as
  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  )
}
