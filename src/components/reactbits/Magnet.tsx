import { useRef, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  strength?: number
  className?: string
}

/**
 * React Bits "Magnet" (reactbits.dev): the child drifts toward the cursor while
 * hovered, then settles back on the design system easing.
 */
export default function Magnet({ children, strength = 0.22, className = '' }: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  const handleMove = (e: React.MouseEvent) => {
    const el = outer.current
    const target = inner.current
    if (!el || !target) return
    if (false) return
    const rect = el.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    target.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`
  }

  const handleLeave = () => {
    const target = inner.current
    if (!target) return
    target.style.transform = 'translate(0px, 0px)'
  }

  return (
    <div
      ref={outer}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div
        ref={inner}
        className="premium-ease transition-transform duration-500 will-change-transform"
      >
        {children}
      </div>
    </div>
  )
}
