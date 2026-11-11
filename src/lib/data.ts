/**
 * Everything the site reads comes from /public/data (committed, static).
 * Layer .bin files are lazy-loaded the first time their layer is selected.
 */

export type LayerType = 'raster' | 'vector' | 'categorical'

export interface LayerClass {
  id: number
  label: string
  color: string
  code: number[]
}

export interface LayerDef {
  id: string
  label: string
  unit: string
  type: LayerType
  min: number
  max: number
  scale: 'linear' | 'log'
  ramp: string[]
  heightMode: 'value' | 'flat'
  heightScale: number
  heightExponent: number
  source: string
  sourceUrl: string
  license: string
  year: number
  classes?: LayerClass[]
  sink?: boolean
  exaggeration?: number
}

export interface Meta {
  bbox: [number, number, number, number]
  cols: number
  rows: number
  cellSizeDeg: number
  crs: string
}

export interface RegionStats {
  mean: number | null
  min: number | null
  max: number | null
  population?: number
  riverKm?: number
  /** modal class id, only for categorical layers */
  dominant?: number
}

export interface District {
  id: number
  name: string
  divisionId: number
  divisionName: string
  bbox: [number, number, number, number]
  centroid: [number, number]
  areaKm2: number
  stats: Record<string, RegionStats>
}

export interface Division {
  id: number
  name: string
  bbox: [number, number, number, number]
  centroid: [number, number]
  areaKm2: number
  divisionId: number
  stats: Record<string, RegionStats>
  districts: District[]
}

/**
 * District population totals in the committed data are unreliable: several are
 * 0 (Gazipur) while others carry division-scale numbers, so a district could
 * read 0.0 M. Derive the total from the region's own mean density and land area
 * instead, and only trust the stored figure when it agrees with that.
 */
export function regionPopulation(region: {
  areaKm2: number
  stats?: Record<string, RegionStats>
}): number {
  const p = region.stats?.population
  const derived = (p?.mean ?? 0) * region.areaKm2
  const stored = p?.population
  if (typeof stored === 'number' && stored > 0 && derived > 0) {
    if (Math.abs(stored - derived) / derived < 0.5) return stored
  }
  return derived
}

export interface City {
  name: string
  lat: number
  lon: number
}

export interface RiverFeature {
  type: 'Feature'
  properties: { k: number; o: number; q: number; l: number }
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

export interface Outline {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { name: string }; geometry: unknown }[]
}

export const BASE = import.meta.env.BASE_URL

export const db = {
  meta: null as Meta | null,
  layers: [] as LayerDef[],
  regions: [] as Division[],
  regionsBin: null as Uint8Array | null,
  divisionsBin: null as Uint8Array | null,
  rivers: null as unknown as Outline & { features: RiverFeature[] },
  cities: [] as City[],
  outline: null as unknown as Outline,
  bins: new Map<string, Uint8Array>(),
  pending: new Map<string, Promise<Uint8Array>>(),
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`)
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return (await res.json()) as T
}

async function fetchBin(path: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}data/${path}`)
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function initData(): Promise<void> {
  if (db.meta) return
  const [meta, layers, regions, cities, outline, rivers] = await Promise.all([
    fetchJSON<Meta>('meta.json'),
    fetchJSON<LayerDef[]>('layers.json'),
    fetchJSON<Division[]>('regions.json'),
    fetchJSON<City[]>('cities.json'),
    fetchJSON<Outline>('outline.geojson'),
    fetchJSON<Outline>('rivers.geojson'),
  ])
  const [regionsBin, divisionsBin] = await Promise.all([
    fetchBin('regions.bin'),
    fetchBin('divisions.bin'),
  ])
  db.meta = meta
  db.layers = layers
  db.regions = regions
  db.cities = cities
  db.outline = outline
  db.rivers = rivers as typeof db.rivers
  db.regionsBin = regionsBin
  db.divisionsBin = divisionsBin
}

export function ensureLayer(id: string): Promise<Uint8Array> {
  const cached = db.bins.get(id)
  if (cached) return Promise.resolve(cached)
  const pending = db.pending.get(id)
  if (pending) return pending
  const p = fetchBin(`layers/${id}.bin`).then((bin) => {
    db.bins.set(id, bin)
    db.pending.delete(id)
    return bin
  })
  db.pending.set(id, p)
  return p
}

export function layerDef(id: string): LayerDef {
  return db.layers.find((l) => l.id === id) ?? db.layers[0]
}

/* ------------------------------------------------------------------ numbers */

/** Quantised texel -> real value. Mirrors scripts/common.py. */
export function valueFromQ(layer: LayerDef, q: number): number | null {
  if (!q) return null
  if (layer.type === 'categorical') return q
  const t = (q - 1) / 254
  if (layer.scale === 'log') return Math.expm1(t * Math.log1p(layer.max))
  return layer.min + t * (layer.max - layer.min)
}

/** Real value -> 0..1 position on the layer's ramp. */
export function tFromValue(layer: LayerDef, value: number): number {
  if (layer.scale === 'log') {
    return Math.min(1, Math.max(0, Math.log1p(Math.max(0, value)) / Math.log1p(layer.max)))
  }
  return Math.min(1, Math.max(0, (value - layer.min) / (layer.max - layer.min || 1)))
}

export function formatValue(layer: LayerDef, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (layer.type === 'categorical') {
    return layer.classes?.find((c) => c.id === Math.round(value))?.label ?? '—'
  }
  const unit = layer.unit
  if (unit.includes('people')) return Math.round(value).toLocaleString('en-US')
  if (unit.includes('mm')) return Math.round(value).toLocaleString('en-US')
  if (unit.includes('metres')) return `${Math.round(value).toLocaleString('en-US')} m`
  if (unit.includes('µg')) return `${value.toFixed(1)} µg/m³`
  if (unit.includes('%')) return `${Math.round(value)}%`
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/* ------------------------------------------------------------------- lookup */

export function cellFromLonLat(lon: number, lat: number): { col: number; row: number } | null {
  const m = db.meta
  if (!m) return null
  const [x0, y0, x1, y1] = m.bbox
  if (lon < x0 || lon > x1 || lat < y0 || lat > y1) return null
  const col = Math.min(m.cols - 1, Math.max(0, Math.floor((lon - x0) / m.cellSizeDeg)))
  const row = Math.min(m.rows - 1, Math.max(0, Math.floor((y1 - lat) / m.cellSizeDeg)))
  return { col, row }
}

export function lonLatFromWorld(x: number, z: number, cellKm: number): [number, number] {
  const m = db.meta!
  const [x0, , , y1] = m.bbox
  const lon = x0 + (x / cellKm + m.cols / 2) * m.cellSizeDeg
  const lat = y1 - (z / cellKm + m.rows / 2) * m.cellSizeDeg
  return [lon, lat]
}

export function districtAt(lon: number, lat: number): number {
  const cell = cellFromLonLat(lon, lat)
  if (!cell || !db.regionsBin || !db.meta) return 0
  return db.regionsBin[cell.row * db.meta.cols + cell.col] ?? 0
}

export function divisionOfDistrict(id: number): Division | undefined {
  return db.regions.find((v) => v.districts.some((d) => d.id === id))
}

export function districtById(id: number): District | undefined {
  for (const v of db.regions) {
    const d = v.districts.find((x) => x.id === id)
    if (d) return d
  }
  return undefined
}

export function divisionById(id: number): Division | undefined {
  return db.regions.find((v) => v.id === id)
}

/** Bounding box of the current selection in lon/lat, or the whole country. */
export function selectionBounds(division: number | null, district: number | null) {
  if (district) {
    const d = districtById(district)
    if (d) return d.bbox
  }
  if (division) {
    const v = divisionById(division)
    if (v) return v.bbox
  }
  return db.meta?.bbox ?? [88, 20.5, 92.7, 26.7]
}

export function selectionName(division: number | null, district: number | null): string {
  if (district) return districtById(district)?.name ?? 'Bangladesh'
  if (division) return divisionById(division)?.name ?? 'Bangladesh'
  return 'Bangladesh'
}

export const cellKm = 1.11
