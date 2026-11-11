import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import SoftAurora from './reactbits/SoftAurora'
import ShapeBlur from './reactbits/ShapeBlur'
import BlobCursor from './reactbits/BlobCursor'
import BlurText from './reactbits/BlurText'
import Magnet from './reactbits/Magnet'
import Wave from './Wave'
import { scrollToSection } from '../lib/scroll'

const STATS = ['8 divisions', '64 districts', '8 layers']

function useMedia(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return matches
}

export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const aurora = useRef<HTMLDivElement>(null)
  const narrow = useMedia('(max-width: 768px)')

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.fromTo(
        '[data-hero-sun]',
        { scale: 0.2, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.2 },
        0.6,
      ).fromTo(
        '[data-hero-rise]',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.12 },
        0.85,
      )

      const layer = aurora.current
      if (!layer) return
      gsap.to(layer, {
        opacity: 0,
        y: -90,
        ease: 'none',
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.6,
        },
      })
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      id="top"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-cream md:cursor-none"
    >
      {/* drifting green / rose mesh, 30s linear loop — dimmed so the type can read */}
      <div
        className="hero-mesh pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
      >
        <div className="mesh-field animate-mesh-drift -left-[10%] top-[6%] h-[46vw] w-[46vw] bg-[radial-gradient(circle,rgba(191,232,208,0.7),transparent_68%)]" />
        <div
          className="mesh-field animate-mesh-drift right-[-6%] top-[18%] h-[38vw] w-[38vw] bg-[radial-gradient(circle,rgba(111,207,155,0.42),transparent_66%)]"
          style={{ animationDelay: '-10s' }}
        />
        <div
          className="mesh-field animate-mesh-drift left-[24%] top-[44%] h-[34vw] w-[34vw] bg-[radial-gradient(circle,rgba(244,163,168,0.32),transparent_70%)]"
          style={{ animationDelay: '-20s' }}
        />
      </div>

      {/* static green/red wash: the fallback when WebGL2 is unavailable */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(58% 42% at 50% 60%, rgba(111,207,155,0.26), transparent 70%), radial-gradient(36% 26% at 64% 56%, rgba(229,72,77,0.12), transparent 72%)',
        }}
      />

      <div ref={aurora} className="pointer-events-none absolute inset-0 z-0">
        <SoftAurora
          lightMode
          color1="#6fcf9b"
          color2="#f4a3a8"
          spectrum={0.1}
          speed={narrow ? 0.35 : 0.5}
          colorSpeed={0.6}
          scale={1.4}
          brightness={0.95}
          noiseFrequency={2.2}
          noiseAmplitude={1}
          bandHeight={narrow ? 0.43 : 0.35}
          bandSpread={0.85}
          tilt={-6}
          octaveDecay={0.12}
          layerOffset={5.5}
          enableMouseInteraction={!narrow}
          mouseInfluence={0.25}
          clickPulse
          intro
          opacity={0.85}
        />
      </div>

      {/* a soft green lens that drifts with the pointer (no flat grey shape) */}
      <div className="pointer-events-none absolute inset-0 z-[5] hidden opacity-50 md:block" aria-hidden="true">
        <ShapeBlur
          shape="circle"
          size={0.78}
          thickness={1}
          echoes={2}
          spacing={28}
          color="#bfe8d0"
          blur={44}
          lensSize={0.4}
          lensSoftness={0.9}
          chroma={0.15}
          spin={3}
          idle
        />
      </div>

      {/* Black blob. The blend has to live on this wrapper: a z-indexed wrapper
          forms a stacking context, so a child with mix-blend-mode would have an
          empty backdrop and paint as plain white. Blending here inverts the
          hero beneath it, which is what makes the blob read as black. */}
      <div
        className="pointer-events-none absolute inset-0 z-20 hidden md:block"
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

      <div className="relative z-10 mt-[-4vh] w-full px-5 text-center">
        <p className="mono-label mb-7 !text-[11px] !tracking-[0.22em] text-[#5f5f5f] md:!text-[11px] md:!tracking-[0.3em]">
          A data landscape · 1 km grid · eight layers
        </p>

        <h1 className="serif-display relative mx-auto pb-[0.12em] text-[clamp(3.4rem,13.2vw,13rem)]">
          <BlurText text="Bangla" />
          <span className="relative italic text-accent">
            <BlurText text="desh" delay={0.32} />
            <span data-hero-sun className="hero-sun" />
          </span>
        </h1>

        <p
          data-hero-rise
          className="mx-auto mt-10 max-w-lg text-[15px] leading-relaxed text-[#4a4a4a] md:text-base"
        >
          A country written by its rivers, read through its people. Eight datasets, one
          grid, and sixty-four districts you can walk into.
        </p>

        <div
          data-hero-rise
          className="mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_16px_rgba(111,207,155,0.85)]"
            aria-hidden="true"
          />
          {STATS.map((stat, i) => (
            <span key={stat} className="flex items-center gap-4">
              {i > 0 && <span className="h-3 w-px bg-line" aria-hidden="true" />}
              <span className="mono-label !text-[10px] !tracking-[0.32em] text-[#5f5f5f]">
                {stat}
              </span>
            </span>
          ))}
        </div>
      </div>

      <Wave>
        <Magnet>
          <span className="inline-block animate-cta-pulse rounded-full">
            <button
              type="button"
              data-hero-rise
              onClick={() => scrollToSection('#map')}
              className="group inline-flex items-center gap-3 rounded-full bg-accent px-7 py-3.5 text-sm text-cream transition-colors duration-500 premium-ease hover:bg-green-900 md:px-8 md:py-4"
            >
              <span className="mono-label !text-[10px] !tracking-[0.28em] text-cream">
                Explore the map
              </span>
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-500 premium-ease group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          </span>
        </Magnet>
      </Wave>

      <div className="pointer-events-none absolute bottom-6 left-5 z-20 hidden md:block">
        <span className="mono-label text-[#5f5f5f]">Scroll</span>
      </div>
    </section>
  )
}
