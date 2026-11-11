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
  // the delta sits at 2-15 m against a 1,150 m maximum, so a straight value
  // curve flattened the whole country except the Chittagong hills; an exponent
  // below 1 lifts the plains into readable relief and still lets the hills run
  elevation: { flat: false, scale: 0.65, exp: 0.35 },
  // classes are stored as ids, so a gentle value curve turns the land-use map
  // into stepped terrain: cropland barely lifts, forest, built-up and wetland
  // stand above it. Without this the layer was a flat plate of one colour.
  landuse: { flat: false, scale: 0.62, exp: 1 },
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
  // the elevation ramp is pale by design; compressing it further lost the relief
  elevation: 1,
}

/**
 * Land use is mostly cropland, so one tan filled the country and the other
 * classes were invisible at 1 km. Cropland is pushed almost to the paper tone
 * so the remaining classes read as coloured regions against it.
 */
/**
 * Height per land-use class (0..1 of the max column). Cropland stays low so the
 * forest, built-up and wetland patches rise out of the plain instead of the
 * whole country reading as one flat sheet of tan.
 */
export const CLASS_HEIGHT: Record<string, Record<number, number>> = {
  landuse: { 1: 0.12, 2: 0.72, 3: 0.5, 4: 0.2, 5: 0.55, 6: 0.9, 7: 0.62 },
}

export const CLASS_COLOR_OVERRIDE: Record<string, Record<number, string>> = {
  landuse: {
    1: '#e6d6ab', // cropland: a warm field, not the paper ground
    2: '#2f6b45', // trees
    3: '#8a2f4a', // built-up
    4: '#1f5f8b', // water
    5: '#2f8a8a', // wetland
    6: '#123f2c', // mangrove
    7: '#cbd6bb', // grass / bare
  },
}

export function groundTintOf(layer: LayerDef): string {
  return GROUND_TINT[layer.id] ?? '#eef6f0'
}
