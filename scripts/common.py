"""
Shared grid definition and helpers for the "Bangladesh in Relief" data pipeline.

Every raster layer is written on ONE master grid so the frontend can swap a
layer by swapping a single-channel texture.

Quantisation contract (identical in every layer script, and mirrored in
src/map/layers.ts):

    q = 0                  -> no data / outside the country
    q in 1..255            -> valid, mapped through the layer's scale
    t = (q - 1) / 254      -> 0..1
    linear: v = t * max                    (min is 0 unless stated)
    log:    v = expm1(t * log1p(max))

`max` inside the manifest is therefore the real upper end of the data and is
the only number the frontend needs to un-quantise a texel.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.crs import CRS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
LAYERS_DIR = DATA / "layers"
RAW = ROOT / "scripts" / "raw"

CELL_DEG = 0.01          # ~1.1 km
PAD_DEG = 0.05           # breathing room around the national outline
WGS84 = CRS.from_epsg(4326)

LAYER_ORDER = [
    "population",
    "forest",
    "elevation",
    "rivers",
    "landuse",
    "rainfall",
    "airquality",
    "flood",
]

LANDCOVER_CLASSES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse",
    70: "Snow / ice",
    80: "Permanent water",
    90: "Herbaceous wetland",
    95: "Mangroves",
    100: "Moss / lichen",
}


# --------------------------------------------------------------------------- io
def ensure_dirs() -> None:
    for d in (DATA, LAYERS_DIR, RAW):
        d.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def download(url: str, dest: Path, label: str = "") -> Path:
    """Stream a URL to scripts/raw, skipping files that already exist."""
    import requests

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cached  {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
        return dest
    print(f"  get     {label or dest.name}  <- {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0)
        done = 0
        with open(tmp, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if not chunk:
                    continue
                fh.write(chunk)
                done += len(chunk)
                if total and done % (20 << 20) < (1 << 20):
                    print(f"          {done / 1e6:.0f}/{total / 1e6:.0f} MB")
    tmp.replace(dest)
    print(f"  saved   {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


# ------------------------------------------------------------------------- grid
def grid_from_bounds(bounds) -> dict:
    """Snap a lon/lat bbox (plus padding) onto the 0.01 deg master grid."""
    xmin, ymin, xmax, ymax = bounds
    x0 = math.floor((xmin - PAD_DEG) / CELL_DEG) * CELL_DEG
    y0 = math.floor((ymin - PAD_DEG) / CELL_DEG) * CELL_DEG
    x1 = math.ceil((xmax + PAD_DEG) / CELL_DEG) * CELL_DEG
    y1 = math.ceil((ymax + PAD_DEG) / CELL_DEG) * CELL_DEG
    cols = int(round((x1 - x0) / CELL_DEG))
    rows = int(round((y1 - y0) / CELL_DEG))
    return {
        "bbox": [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
        "cols": cols,
        "rows": rows,
        "cellSizeDeg": CELL_DEG,
        "crs": "EPSG:4326",
        "cellSizeKm": round(CELL_DEG * 111.32, 3),
    }


def grid_transform(meta: dict):
    x0, y0, x1, y1 = meta["bbox"]
    return from_origin(x0, y1, meta["cellSizeDeg"], meta["cellSizeDeg"])


def grid_shape(meta: dict):
    return (meta["rows"], meta["cols"])


def grid_cell_areas_km2(meta: dict) -> np.ndarray:
    """Area of each grid cell in km^2 (varies slightly with latitude)."""
    x0, y0, x1, y1 = meta["bbox"]
    d = meta["cellSizeDeg"]
    rows, cols = grid_shape(meta)
    lats = y1 - d * (np.arange(rows) + 0.5)
    lat_km = d * 111.132
    lon_km = d * 111.320 * np.cos(np.radians(lats))
    return np.repeat((lat_km * lon_km)[:, None], cols, axis=1)


def read_grid(path, meta: dict, resampling=Resampling.bilinear, band: int = 1,
              chunk_rows: int | None = None) -> np.ndarray:
    """Reproject / resample any raster onto the master grid.

    Returns a float32 array (rows, cols) with NaN outside the source data.
    Reads through /vsicurl/ remote COGs one horizontal band at a time so a
    global 10 m mosaic never lands in memory whole.
    """
    rows, cols = grid_shape(meta)
    out = np.full((rows, cols), np.nan, dtype="float32")
    dst_transform = grid_transform(meta)
    step = chunk_rows or rows
    with rasterio.open(path) as src:
        nodata = src.nodata
        src_crs = src.crs or WGS84
        for r0 in range(0, rows, step):
            r1 = min(r0 + step, rows)
            h = r1 - r0
            band_transform = dst_transform * __import__("affine").Affine.translation(0, r0)
            tmp = np.full((h, cols), np.nan, dtype="float32")
            reproject(
                source=rasterio.band(src, band),
                destination=tmp,
                src_transform=src.transform,
                src_crs=src_crs,
                src_nodata=nodata,
                dst_transform=band_transform,
                dst_crs=WGS84,
                dst_nodata=np.nan,
                resampling=resampling,
            )
            out[r0:r1] = tmp
    return out


def sample_raster(path, meta: dict, lons: np.ndarray, lats: np.ndarray,
                  band: int = 1) -> np.ndarray:
    """Nearest-neighbour point sampling from a COG at lon/lat arrays."""
    x0, y0, x1, y1 = meta["bbox"]
    d = meta["cellSizeDeg"]
    cols = np.clip(((np.asarray(lons) - x0) / d).astype(int), 0, meta["cols"] - 1)
    rows = np.clip(((y1 - np.asarray(lats)) / d).astype(int), 0, meta["rows"] - 1)
    with rasterio.open(path) as src:
        vals = np.array([v[0] for v in src.sample(zip(lons, lats), indexes=band)])
    return vals, rows, cols


# -------------------------------------------------------------------- quantise
def quantize(arr: np.ndarray, vmin: float, vmax: float, scale: str = "linear",
             valid: np.ndarray | None = None) -> np.ndarray:
    """Float array -> uint8 with 0 reserved for nodata and 1..255 for data."""
    a = np.asarray(arr, dtype="float64")
    ok = np.isfinite(a)
    if valid is not None:
        ok &= valid
    a = np.where(ok, np.clip(a, vmin, vmax), vmin)
    if scale == "log":
        denom = math.log1p(max(vmax, 0.0)) or 1.0
        t = np.log1p(np.maximum(a, 0.0)) / denom
    else:
        denom = (vmax - vmin) or 1.0
        t = (a - vmin) / denom
    q = 1 + np.round(np.clip(t, 0.0, 1.0) * 254).astype(np.int16)
    return np.where(ok, np.clip(q, 1, 255), 0).astype(np.uint8)


def dequantize(q: np.ndarray, vmin: float, vmax: float, scale: str = "linear") -> np.ndarray:
    t = (np.asarray(q, dtype="float64") - 1) / 254.0
    if scale == "log":
        return np.expm1(t * math.log1p(max(vmax, 0.0)))
    return vmin + t * (vmax - vmin)


def write_bin(name: str, q: np.ndarray) -> int:
    path = LAYERS_DIR / f"{name}.bin"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(np.ascontiguousarray(q, dtype=np.uint8).tobytes())
    return path.stat().st_size


def read_bin(name: str, meta: dict) -> np.ndarray:
    path = LAYERS_DIR / f"{name}.bin" if not str(name).endswith(".bin") else Path(name)
    return np.frombuffer(path.read_bytes(), dtype=np.uint8).reshape(grid_shape(meta))


# ---------------------------------------------------------------------- regions
def load_regions_bins(meta: dict):
    """District raster (0 = outside, 1..64) and division raster (0, 1..8)."""
    dist = read_bin("regions", meta)
    div = read_bin("divisions", meta)
    return dist, div


def zonal(arr: np.ndarray, region_raster: np.ndarray, ids) -> dict:
    """Mean/min/max/sum/count of a float array per region id."""
    ids = list(ids)
    top = int(max(ids)) + 1
    a = np.asarray(arr, dtype="float64")
    reg = region_raster.astype(np.int32, copy=False)
    ok = np.isfinite(a) & (reg > 0)
    flat_a = np.where(ok, a, 0.0)
    flat_r = reg[ok]
    flat_v = flat_a[ok]
    counts = np.bincount(flat_r, minlength=top).astype("float64")
    sums = np.bincount(flat_r, weights=flat_v, minlength=top)
    mins = np.full(top, np.nan)
    maxs = np.full(top, np.nan)
    if flat_v.size:
        np.fmin.at(mins, flat_r, flat_v)
        np.fmax.at(maxs, flat_r, flat_v)
    out = {}
    for i in ids:
        c = counts[i] if i < len(counts) else 0
        out[i] = {
            "mean": round(float(sums[i] / c), 4) if c else None,
            "min": round(float(mins[i]), 4) if c and np.isfinite(mins[i]) else None,
            "max": round(float(maxs[i]), 4) if c and np.isfinite(maxs[i]) else None,
            "sum": round(float(sums[i]), 2),
            "cells": int(c),
        }
    return out


def regions_path() -> Path:
    return DATA / "regions.json"


def load_regions_doc() -> list:
    return load_json(regions_path(), []) or []


def attach_stats(layer_id: str, arr: np.ndarray, meta: dict, extra_fn=None) -> None:
    """Write per-district stats and roll them up into each division."""
    doc = load_regions_doc()
    if not doc:
        raise SystemExit("regions.json missing - run build_base.py first")
    dist_bin, div_bin = load_regions_bins(meta)
    all_districts = [d for div in doc for d in div["districts"]]
    d_stats = zonal(arr, dist_bin, [d["id"] for d in all_districts])
    v_stats = zonal(arr, div_bin, [v["id"] for v in doc])
    for d in all_districts:
        s = d_stats[d["id"]]
        entry = {"mean": s["mean"], "min": s["min"], "max": s["max"]}
        if extra_fn:
            entry.update(extra_fn(arr, d, meta) or {})
        d["stats"][layer_id] = entry
    for v in doc:
        s = v_stats[v["id"]]
        entry = {"mean": s["mean"], "min": s["min"], "max": s["max"]}
        if extra_fn:
            entry.update(extra_fn(arr, v, meta) or {})
        v["stats"][layer_id] = entry
    save_json(regions_path(), doc)


def upsert_layer(entry: dict) -> None:
    path = DATA / "layers.json"
    layers = load_json(path, []) or []
    layers = [l for l in layers if l["id"] != entry["id"]]
    layers.append(entry)
    order = {k: i for i, k in enumerate(LAYER_ORDER)}
    layers.sort(key=lambda l: order.get(l["id"], 99))
    save_json(path, layers)
    print(f"  layers.json: {[l['id'] for l in layers]}")


def layer_exists(layer_id: str) -> bool:
    layers = load_json(DATA / "layers.json", []) or []
    return any(l["id"] == layer_id for l in layers)


def data_bytes() -> int:
    total = 0
    for p in DATA.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def report_sizes() -> None:
    total = data_bytes()
    print("\n--- public/data sizes ---")
    for p in sorted(DATA.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(DATA)!s:<32} {p.stat().st_size / 1e3:8.1f} kB")
    print(f"  {'TOTAL':<32} {total / 1e6:8.2f} MB (budget 4.00 MB)")
