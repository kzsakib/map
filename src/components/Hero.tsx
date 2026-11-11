import BlurText from './reactbits/BlurText'
import Magnet from './reactbits/Magnet'
import Wave from './Wave'
import { scrollToSection } from '../lib/scroll'

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
    >
      {/* drifting indigo / purple mesh, 30s linear loop */}
      <div className="hero-mesh pointer-events-none absolute inset-0 opacity-90" aria-hidden="true">
        <div className="mesh-field animate-mesh-drift -left-[10%] top-[6%] h-[46vw] w-[46vw] bg-[radial-gradient(circle,rgba(199,210,254,0.75),transparent_68%)]" />
        <div
          className="mesh-field animate-mesh-drift right-[-6%] top-[18%] h-[38vw] w-[38vw] bg-[radial-gradient(circle,rgba(233,213,255,0.7),transparent_66%)]"
          style={{ animationDelay: '-10s' }}
        />
        <div
          className="mesh-field animate-mesh-drift left-[24%] top-[44%] h-[34vw] w-[34vw] bg-[radial-gradient(circle,rgba(252,231,243,0.8),transparent_70%)]"
          style={{ animationDelay: '-20s' }}
        />
      </div>

      <div className="relative z-10 mt-[-6vh] w-full px-5 text-center">
        <p className="mono-label mb-7 text-ink/45">A data landscape · 1 km grid · eight layers</p>

        <h1 className="serif-display mx-auto text-[clamp(3.6rem,13.2vw,13rem)]">
          <BlurText text="Bangla" />
          <span className="italic text-accent">
            <BlurText text="desh" delay={0.32} />
          </span>
        </h1>

        <p className="mx-auto mt-8 max-w-lg text-[15px] leading-relaxed text-ink/65 md:text-base">
          A country written by its rivers, read through its people. Eight datasets,
          one grid, and sixty-four districts you can walk into.
        </p>
      </div>

      <Wave>
        <Magnet>
          <button
            type="button"
            onClick={() => scrollToSection('#map')}
            className="group inline-flex items-center gap-3 rounded-full bg-accent px-7 py-3.5 text-sm text-cream transition-colors duration-500 premium-ease hover:bg-[#372fa8] md:px-8 md:py-4"
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
        </Magnet>
      </Wave>

      <div className="pointer-events-none absolute bottom-6 left-5 z-20 hidden md:block">
        <span className="mono-label text-ink/35">Scroll</span>
      </div>
    </section>
  )
}
