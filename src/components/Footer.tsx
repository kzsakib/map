const DATA = [
  ['geoBoundaries BGD ADM1/ADM2', 'CC BY 4.0'],
  ['WorldPop 2020, 1 km', 'CC BY 4.0'],
  ['ESA WorldCover 2021 v200', 'CC BY 4.0'],
  ['Copernicus DEM GLO-90', '© ESA'],
  ['HydroSHEDS / HydroRIVERS v10', 'Attribution'],
  ['WorldClim 2.1 (bio_12)', 'CC BY 4.0'],
  ['ACAG SatPM2.5 V6.GL.02.04', 'CC BY 4.0'],
  ['JRC Global Surface Water', '© EC JRC / Copernicus'],
]

const LINKS = [
  ['Source on GitHub', 'https://github.com/kzsakib/map'],
  ['geoBoundaries', 'https://www.geoboundaries.org'],
  ['WorldPop', 'https://hub.worldpop.org'],
  ['ESA WorldCover', 'https://esa-worldcover.org'],
  ['HydroSHEDS', 'https://www.hydrosheds.org'],
  ['WorldClim', 'https://www.worldclim.org'],
  ['ACAG PM2.5', 'https://sites.wustl.edu/acag/datasets/surface-pm2-5/'],
  ['JRC Global Surface Water', 'https://global-surface-water.appspot.com'],
]

export default function Footer() {
  return (
    <footer
      id="data"
      className="relative mt-10 overflow-hidden rounded-t-footer bg-[#171717] pt-24 pb-10 text-cream"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(46%_84%_at_62%_0%,rgba(244,163,168,0.14),transparent_74%),radial-gradient(62%_100%_at_40%_0%,rgba(111,207,155,0.18),transparent_72%)]"
      />

      <div className="relative mx-auto max-w-[1500px] px-5 md:px-10">
        <p className="mono-label text-cream/40">Coda</p>
        <blockquote className="mt-8 max-w-4xl font-serif text-[clamp(1.9rem,4.4vw,3.6rem)] leading-[1.08]">
          The rivers do not leave this land — they <span className="italic text-green-400">gather</span> it.
          Every life in the delta is a promise the water keeps returning to.
        </blockquote>

        <div className="mt-20 grid gap-12 border-t border-white/10 pt-12 md:grid-cols-3">
          <div>
            <p className="mono-label text-cream/40">Data</p>
            <ul className="mt-5 space-y-2.5">
              {DATA.map(([name, license]) => (
                <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-[13px] text-cream/75">{name}</span>
                  <span className="mono-label !text-[11px] !tracking-[0.16em] text-cream/35">
                    {license}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mono-label text-cream/40">Credits</p>
            <p className="mt-5 text-[13px] leading-relaxed text-cream/65">
              Built with React, TypeScript, Vite, Tailwind CSS, Three.js,
              react-three-fiber, drei, GSAP and Lenis. Hero and stat motion follow
              React Bits patterns (reactbits.dev), adapted to this design system.
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-cream/45">
              Boundaries by geoBoundaries (BBS / OCHA). Population estimates are
              modelled, not census counts. Every layer is quantised to one shared
              1 km grid so the eight landscapes can be read against each other.
            </p>
          </div>

          <div>
            <p className="mono-label text-cream/40">Links</p>
            <ul className="mt-5 space-y-2.5">
              {LINKS.map(([label, href]) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-2 text-[13px] text-cream/70 transition-colors duration-500 premium-ease hover:text-cream"
                  >
                    {label}
                    <span
                      aria-hidden="true"
                      className="opacity-0 transition-opacity duration-500 premium-ease group-hover:opacity-100"
                    >
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="mono-label !text-[11px] !tracking-[0.24em] text-cream/35">
            Bangladesh in Relief · eight layers · 64 districts
          </p>
          <p className="mono-label !text-[11px] !tracking-[0.24em] text-cream/25">
            Data are indicative; read every number with its source.
          </p>
        </div>
      </div>
    </footer>
  )
}
