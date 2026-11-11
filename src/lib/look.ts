import type { LayerDef } from './data'

/**
 * Visual overrides. The rasters in /public/data are untouched; these only
 * change how a layer is painted and how tall it stands.
 */
export const RAMP_OVERRIDES: Record<string, string[]> = {
  population: ['#eef6f0', '#f4a3a8', '#e5703f', '#2a0716'],
  forest: ['#effaf4', '#bfe8d0', '#6fcf9b', '#0f3d2e'],
  airquality: ['#fcfbf9', '#e9c46a', '#e5484d', '#2a0716'],
  // the shipped ramp runs pale lilac to indigo, which fought the whole palette
  // and made the rivers layer the one screen that looked off; water now reads
  // as mint through to deep green like the rest of the site
  // water reads as water: a clean teal-to-deep-blue ramp, kept off indigo so it
  // still belongs beside the green-led palette
  rivers: ['#eef6fa', '#cfe8f2', '#a3d3e4', '#6bb7d0', '#2f8fb3', '#12556f'],
}

/** Taller, more selective population spikes: only the big cities stand out. */
export const HEIGHT_BOOST: Record<string, { scale: number; exp: number }> = {
  population: { scale: 1.8, exp: 1.15 },
}

/**
 * Shape overrides for layers whose stored height fields don't suit the site.
 * Rivers ship as a flat plane with almost no height, which is why the layer read
 * as a pale carpet with no structure next to the spiky ones.
 */
export const SHAPE_OVERRIDES: Record<string, { flat: boolean; scale: number; exp: number }> = {
  // water fraction is mostly small, so the columns were invisible at a steep
  // curve and then too tall at a shallow one; this keeps the delta readable
  // without the coast turning into a wall of blades
  rivers: { flat: false, scale: 0.42, exp: 1.9 },
}

export function rampOf(layer: LayerDef): string[] {
  return RAMP_OVERRIDES[layer.id] ?? layer.ramp
}

/**
 * The ground stays pale: the colour belongs on the spikes, not in a saturated
 * wash across the country.
 */
export const GROUND_TINT: Record<string, string> = {
  population: '#eef6f0',
  forest: '#dff0e6',
  elevation: '#f3ecdf',
  rivers: '#e7f2f7',
  landuse: '#f1eee4',
  rainfall: '#e6eef4',
  airquality: '#f4ece4',
  flood: '#e7eef4',
}

/** how much of the layer ramp survives in the ground wash (0..1) */
export const GROUND_RAMP_MIX = 0.08

/** per-layer ground wash, for layers that need the silhouette to carry them */
export const GROUND_MIX_OVERRIDE: Record<string, number> = {
  rivers: 0.6,
}

/**
 * Colour compression, per layer. The default 2.6 keeps most cells near the pale
 * end of the ramp, which suits dense layers but left rivers almost colourless;
 * water reads at full ramp.
 */
export const COLOR_POW_OVERRIDE: Record<string, number> = {
  rivers: 1,
}

export function groundTintOf(layer: LayerDef): string {
  return GROUND_TINT[layer.id] ?? '#eef6f0'
}
