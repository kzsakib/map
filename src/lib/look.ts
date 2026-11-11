import type { LayerDef } from './data'

/**
 * Visual overrides. The rasters in /public/data are untouched; these only
 * change how a layer is painted and how tall it stands.
 */
export const RAMP_OVERRIDES: Record<string, string[]> = {
  population: ['#eef6f0', '#f4a3a8', '#e5703f', '#2a0716'],
  forest: ['#effaf4', '#bfe8d0', '#6fcf9b', '#0f3d2e'],
  airquality: ['#fcfbf9', '#e9c46a', '#e5484d', '#2a0716'],
}

/** Taller, more selective population spikes: only the big cities stand out. */
export const HEIGHT_BOOST: Record<string, { scale: number; exp: number }> = {
  population: { scale: 1.8, exp: 1.15 },
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
  rivers: '#e8eff4',
  landuse: '#f1eee4',
  rainfall: '#e6eef4',
  airquality: '#f4ece4',
  flood: '#e7eef4',
}

/** how much of the layer ramp survives in the ground wash (0..1) */
export const GROUND_RAMP_MIX = 0.08

export function groundTintOf(layer: LayerDef): string {
  return GROUND_TINT[layer.id] ?? '#eef6f0'
}
