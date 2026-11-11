import { scrollToSection } from '../lib/scroll'
import { useStore } from '../store'

const LINKS = [
  { label: 'Map', target: '#map' },
  { label: 'Regions', target: '#map' },
  { label: 'Data', target: '#data' },
]

export default function Header() {
  const dataLoaded = useStore((s) => s.dataLoaded)

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-20 mix-blend-difference">
      <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between px-5 text-white md:px-10">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            scrollToSection('#top')
          }}
          className="font-serif text-lg italic leading-none tracking-tight md:text-xl"
        >
          Bangladesh <span className="not-italic">in</span> Relief
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-10 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.target}
              href={link.target}
              onClick={(e) => {
                e.preventDefault()
                scrollToSection(link.target)
              }}
              className="mono-label group relative py-2"
            >
              {link.label}
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white transition-all duration-500 premium-ease group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 rounded-full border border-white/45 px-3 py-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              dataLoaded
                ? 'animate-dot-pulse bg-green-400 shadow-[0_0_14px_rgba(111,207,155,0.95)]'
                : 'bg-white/60'
            }`}
            aria-hidden="true"
          />
          <span className="mono-label !text-[11px] !tracking-[0.24em]">
            {dataLoaded ? 'Data Loaded' : 'Loading Data'}
          </span>
        </div>
      </div>
    </header>
  )
}
