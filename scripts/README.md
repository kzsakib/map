# Data pipeline — Bangladesh in Relief

Everything in `public/data/` is generated once by these scripts and committed.
There is no backend and no database at runtime: the frontend fetches static
files and swaps a texture when the layer changes.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install geopandas rasterio numpy shapely requests pyproj rioxarray xarray scipy netCDF4
```

Downloads land in `scripts/raw/` (gitignored). They are cached, so re-running a
script is cheap.

```bash
.venv/bin/python scripts/build_base.py            # PHASE 1
.venv/bin/python scripts/layers/forest_landuse.py # PHASE 2.1
.venv/bin/python scripts/layers/elevation.py      # PHASE 2.2
.venv/bin/python scripts/layers/rivers.py         # PHASE 2.3
.venv/bin/python scripts/layers/rainfall.py       # PHASE 2.4
.venv/bin/python scripts/layers/airquality.py     # PHASE 2.5
.venv/bin/python scripts/layers/flood.py          # PHASE 2.6
```

Each script ends with its own checkpoint assertions and prints the data budget.

## The master grid

`common.py` derives one grid for every layer from the dissolved ADM1 outline
plus a 0.05° pad:

| | |
|---|---|
| CRS | EPSG:4326 |
| cell | 0.01° (~1.1 km) |
| grid | 478 × 611 = 292,058 cells |
| inside Bangladesh | 124,158 cells |
| raster layers | `uint8`, row-major, top-down |

`meta.json` carries `bbox`, `cols`, `rows`, `cellSizeDeg`.

## Quantisation contract

Shared by `common.quantize` and `src/map/layers.ts`:

```
q = 0            -> no data / outside the country
q in 1..255      -> valid
t = (q - 1) / 254
linear:   v = min + t * (max - min)
log:      v = expm1(t * log1p(max))      // min is 0
```

`min`/`max` in `layers.json` are the real ends of the data, so a tooltip can
un-quantise any texel. Categorical layers (`landuse`) store the class id
verbatim in `q` (1..7) and the shader samples the palette without blending.

Affine note: `regions.bin` holds district ids 1..64, `divisions.bin` holds
division ids 1..8 (both uint8 on the master grid), so hover and selection are a
single texture read with no geometry search.

## Outputs

| file | what |
|---|---|
| `meta.json` | grid definition |
| `regions.bin` | district id per cell (0 = outside) |
| `divisions.bin` | division id per cell (0 = outside) |
| `regions.json` | divisions with nested districts, bbox, centroid, areaKm², population, per-layer stats (mean/min/max, plus `riverKm`) |
| `layers.json` | one manifest entry per layer: id, label, unit, type, min/max, scale, ramp, height mode/scale/exponent, source, licence, year |
| `layers/*.bin` | the quantised raster per layer |
| `outline.geojson` | national outline simplified to ~0.001° |
| `rivers.geojson` | HydroRIVERS ≥ Strahler 4, simplified to 0.001°, props `q` (m³/s), `o` (order), `l` (km) |
| `cities.json` | the eight divisional capitals |

## Sources and licences

| layer | dataset | licence |
|---|---|---|
| boundaries | geoBoundaries gbOpen BGD ADM1/ADM2 (BBS/OCHA) | CC BY 4.0 |
| population | WorldPop 2020, 1 km unconstrained, people/pixel ÷ pixel area | CC BY 4.0 |
| forest, land use, water | ESA WorldCover 2021 v200, 10 m COG (sub-pixel fractions at 200 m) | CC BY 4.0 |
| elevation | Copernicus DEM GLO-90 | © ESA, free with attribution |
| rivers | HydroRIVERS v10 Asia | HydroSHEDS licence (attribution) |
| rainfall | WorldClim 2.1, 30 arc-second monthly precipitation summed to annual (bio_12) | CC BY 4.0 |
| air quality | ACAG SatPM2.5 V6.GL.02.04, annual 2023, 0.01° | CC BY 4.0 |
| flood | JRC Global Surface Water 2021, water occurrence | © EC JRC / Copernicus |

Deviations from the brief, all deliberate:

* JRC tiles are named by their **north** edge, so `80E_30N` / `90E_30N` cover
  Bangladesh (`80E_20N` covers 10–20°N).
* WorldClim's `bio_12` is only distributed inside a ~10 GB archive, so the
  twelve 30 arc-second monthly grids are summed instead — the same quantity,
  1 GB.
* geoBoundaries still ships pre-2018 names; the scripts normalise them
  (Chattogram, Barishal, Cumilla, Jashore, Bogura, …).
* `divisions.bin`, `heightExponent` and `max` per layer are additions that keep
  hover/selection cheap and the shader honest.
* WorldCover is sampled at 200 m sub-pixels rather than 10 m: full-resolution
  reads over 5° × 6° would be tens of GB of HTTP traffic for a 1 km map.
