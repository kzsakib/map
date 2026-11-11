import type { ReactNode } from 'react'

/** The exact wave geometry from the design spec, with the CTA on the crest. */
export default function Wave({ children }: { children: ReactNode }) {
  return (
    <div className="wave-container">
      <div className="wave-curve" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[10vh] z-20 flex justify-center">
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  )
}
