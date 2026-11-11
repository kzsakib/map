import Accordion from './Accordion'
import { useStore } from '../store'

export default function RegionsDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const clearSelection = useStore((s) => s.clearSelection)

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="regions-drawer"
        className={`absolute right-0 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-l-[12px] border border-r-0 border-line bg-cream/75 px-2.5 py-4 backdrop-blur-md transition-transform duration-[600ms] premium-ease hover:bg-green-50 md:flex ${
          open ? 'translate-x-[420px]' : 'translate-x-0'
        }`}
      >
        <span className="mono-label !text-[11px] !tracking-[0.26em] text-[#4a4a4a] [writing-mode:vertical-rl]">
          Regions
        </span>
        <span aria-hidden="true" className="text-[#5f5f5f]">
          ‹
        </span>
      </button>

      <aside
        id="regions-drawer"
        aria-hidden={!open}
        className={`absolute right-0 top-0 z-30 h-full w-[420px] max-w-[90vw] border-l border-line bg-cream/75 backdrop-blur-xl transition-transform duration-[600ms] premium-ease ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ boxShadow: open ? '-30px 0 80px -50px rgba(111,207,155,0.5)' : 'none' }}
      >
        <div className="flex h-full flex-col pt-24">
          <div className="flex items-end justify-between gap-4 px-6">
            <div>
              <p className="mono-label !text-[11px] !tracking-[0.26em] text-[#5f5f5f]">Sixty-four districts</p>
              <h2 className="mt-2 font-serif text-[30px] leading-none">
                Explore the <span className="italic text-accent">Regions</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="mono-label whitespace-nowrap !text-[11px] !tracking-[0.2em] text-[#5f5f5f] transition-colors duration-500 premium-ease hover:text-accent"
            >
              Reset view →
            </button>
          </div>
          <div data-lenis-prevent className="mt-6 min-h-0 flex-1 overflow-y-auto px-6 pb-10">
            <Accordion />
          </div>
        </div>
      </aside>
    </>
  )
}
