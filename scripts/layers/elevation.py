"""
PHASE 2.2 - elevation from Copernicus DEM GLO-90 (1 degree COG tiles, AWS).

35 tiles cover Bangladesh. Each tile is ~1200x1200 int16, so downloading all
of them is only ~100 MB; they are then averaged onto the 1 km master grid.
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.warp import reproject

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

BASE = "https://copernicus-dem-90m.s3.amazonaws.com"
RAMP = ["#e9f0e2", "#b7cfa0", "#d8c48f", "#b08a5e", "#8a6b52", "#f4f1ea", "#ffffff"]
CLAMP_MAX = 1100.0


def tile_name(lat: int, lon: int) -> str:
    stem = f"Copernicus_DSM_COG_30_{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_E{lon:03d}_00_DEM"
    return stem


def fetch(lat: int, lon: int) -> Path | None:
    stem = tile_name(lat, lon)
    url = f"{BASE}/{stem}/{stem}.tif"
    dest = C.RAW / "dem" / f"{stem}.tif"
    try:
        return C.download(url, dest, f"DEM {stem}")
    except Exception as exc:  # noqa: BLE001 - a missing ocean tile is fine
        print(f"  skip {stem}: {exc}")
        return None


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    dist_bin, _ = C.load_regions_bins(meta)
    country = dist_bin > 0
    rows, cols = C.grid_shape(meta)
    x0, y0, x1, y1 = meta["bbox"]
    cell = meta["cellSizeDeg"]

    lats = range(int(np.floor(y0)), int(np.ceil(y1)))
    lons = range(int(np.floor(x0)), int(np.ceil(x1)))
    jobs = [(la, lo) for la in lats for lo in lons]
    print(f"[1/3] {len(jobs)} DEM tiles")

    paths = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for p in pool.map(lambda t: fetch(*t), jobs):
            if p:
                paths.append(p)
    print(f"  have {len(paths)} tiles")

    print("[2/3] mosaic onto the master grid")
    dem = np.full((rows, cols), np.nan, dtype="float32")
    transform = C.grid_transform(meta)
    for path in paths:
        with rasterio.open(path) as src:
            arr = src.read(1)
            nodata = src.nodata
            bounds = src.bounds
        arr = arr.astype("float32")
        if nodata is not None:
            arr[arr == nodata] = np.nan
        arr[arr < -100] = np.nan
        cs = int(round((max(bounds.left, x0) - x0) / cell))
        ce = int(round((min(bounds.right, x1) - x0) / cell))
        rs = int(round((y1 - min(bounds.top, y1)) / cell))
        re = int(round((y1 - max(bounds.bottom, y0)) / cell))
        if ce <= cs or re <= rs:
            continue
        dst = np.full((re - rs, ce - cs), np.nan, dtype="float32")
        dst_transform = transform * Affine.translation(cs, rs)
        reproject(source=arr, destination=dst, src_transform=src.transform,
                  src_crs="EPSG:4326", dst_transform=dst_transform,
                  dst_crs=C.WGS84, resampling=Resampling.average,
                  src_nodata=np.nan, dst_nodata=np.nan)
        window = dem[rs:re, cs:ce]
        dem[rs:re, cs:ce] = np.where(np.isnan(window), dst, window)

    dem = np.clip(dem, 0.0, CLAMP_MAX)
    dem = np.where(country & np.isfinite(dem), dem, np.nan)
    print(f"  elevation inside country: min {np.nanmin(dem):.1f}  "
          f"median {np.nanmedian(dem):.1f}  max {np.nanmax(dem):.1f} m")

    print("[3/3] quantise + stats")
    vmax = 1150.0  # a little headroom above the highest peak (~1050 m)
    q = C.quantize(dem, 0, vmax, "linear", valid=country)
    C.write_bin("elevation", q)
    C.attach_stats("elevation", dem, meta)
    C.upsert_layer({
        "id": "elevation",
        "label": "Elevation",
        "unit": "metres",
        "type": "raster",
        "min": 0,
        "max": vmax,
        "scale": "linear",
        "ramp": RAMP,
        "heightMode": "value",
        "heightScale": 1.0,
        "heightExponent": 1.35,
        "exaggeration": 6,
        "source": "Copernicus DEM GLO-90 (90 m), averaged to 1 km",
        "sourceUrl": "https://registry.opendata.aws/copernicus-dem/",
        "license": "Free, © ESA / Copernicus DEM",
        "year": 2021,
    })

    doc = C.load_regions_doc()
    top = sorted(((d["stats"]["elevation"]["max"] or 0, d["name"], v["name"])
                  for v in doc for d in v["districts"]), reverse=True)[:5]
    print("  highest districts:", [(n, round(m, 0), dv) for m, n, dv in top])
    flat = [d["stats"]["elevation"]["mean"] for v in doc for d in v["districts"]]
    print(f"  mean district elevation across country: {np.mean(flat):.1f} m")
    assert top[0][1] == "Bandarban", f"expected Bandarban as the highest district, got {top[0]}"
    # GLO-90 averaged onto 1 km cells smooths the ~1050 m Saka Haphong summit
    assert 800 < top[0][0] < 1200, f"unexpected peak {top[0][0]}"
    assert np.nanmedian(flat) < 60, "the delta should stay close to sea level"
    C.report_sizes()


if __name__ == "__main__":
    main()
