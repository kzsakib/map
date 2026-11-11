import { create } from 'zustand'

export type Hovered = { kind: 'district' | 'division'; id: number; lon: number; lat: number } | null

export type Selection = { division: number | null; district: number | null }

type Store = {
  activeLayer: string
  selectedDivision: number | null
  selectedDistrict: number | null
  hovered: Hovered
  dataLoaded: boolean
  layerLoading: string | null
  setLayer: (id: string) => void
  setSelection: (sel: Selection) => void
  clearSelection: () => void
  setHovered: (h: Hovered) => void
  setDataLoaded: (v: boolean) => void
  setLayerLoading: (id: string | null) => void
}

export const useStore = create<Store>((set) => ({
  activeLayer: 'population',
  selectedDivision: null,
  selectedDistrict: null,
  hovered: null,
  dataLoaded: false,
  layerLoading: null,
  setLayer: (id) => set({ activeLayer: id }),
  setSelection: ({ division, district }) =>
    set({
      selectedDivision: division ?? null,
      selectedDistrict: district ?? null,
    }),
  clearSelection: () => set({ selectedDivision: null, selectedDistrict: null }),
  setHovered: (hovered) => set({ hovered }),
  setDataLoaded: (dataLoaded) => set({ dataLoaded }),
  setLayerLoading: (layerLoading) => set({ layerLoading }),
}))

/** True when the user asked the OS to reduce motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** True on narrow screens (the map downsamples the grid by 2). */
export const isCoarse = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
