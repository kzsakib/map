"""
PHASE 2.6 - flood risk from JRC Global Surface Water (monthly water occurrence).

The JRC tiles are 10x10 degree files named by their NORTH edge (80E_20N spans
10-20 N), so Bangladesh (20.5-26.7 N) needs 80E_30N and 90E_30N.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from rasterio.warp import reproject, transform_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

BASE = ("https://storage.googleapis.com/global-surface-water/downloads2021/"
        "occurrence/occurrence_{tile}v1_4_2021.tif")
TILES = ["80E_30N", "90E_30N"]
RAMP = ["#f7f5ec", "#e3eef0", "#b9dbe2", "#7fb9cc", "#4a86b4", "#2a4d8f"]


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    dist_bin, _ = C.load_regions_bins(meta)
    country = dist_bin > 0
    rows, cols = C.grid_shape(meta)
    x0, y0, x1, y1 = meta["bbox"]
    transform = C.grid_transform(meta)

    print("[1/3] JRC Global Surface Water occurrence")
    occ = np.full((rows, cols), np.nan, dtype="float32")
    for tile in TILES:
        path = C.download(BASE.format(tile=tile), C.RAW / f"occurrence_{tile}.tif", f"JRC {tile}")
        with rasterio.open(path) as src:
            crs = src.crs or C.WGS84
            if crs != C.WGS84:
                left, bottom, right, top = transform_bounds(
                    C.WGS84, crs, x0, y0, x1, y1, densify_pts=21)
            else:
                left, bottom, right, top = x0, y0, x1, y1
            win = from_bounds(max(left, src.bounds.left), max(bottom, src.bounds.bottom),
                              min(right, src.bounds.right), min(top, src.bounds.top),
                              transform=src.transform)
            win = win.round_offsets().round_lengths()
            win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
            if win.width <= 0 or win.height <= 0:
                print(f"  ! {tile} does not overlap the grid")
                continue
            arr = src.read(1, window=win).astype("float32")
            wt = src.window_transform(win)
            nodata = src.nodata
        if nodata is not None:
            arr[arr == nodata] = np.nan
        arr[(arr < 0) | (arr > 100)] = np.nan
        dst = np.full((rows, cols), np.nan, dtype="float32")
        reproject(source=arr, destination=dst, src_transform=wt,
                  src_crs=crs, dst_transform=transform,
                  dst_crs=C.WGS84, resampling=Resampling.average,
                  src_nodata=np.nan, dst_nodata=np.nan)
        occ = np.where(np.isnan(occ), dst, np.where(np.isnan(dst), occ, np.maximum(occ, dst)))
        print(f"  {tile}: {int(np.isfinite(dst).sum())} grid cells")

    occ = np.where(country & np.isfinite(occ), np.clip(occ, 0, 100), np.nan)
    if not np.isfinite(occ).any():
        raise SystemExit("no JRC coverage landed on the grid")
    print(f"[2/3] occurrence %: mean {np.nanmean(occ):.1f}  max {np.nanmax(occ):.0f}  "
          f"cells > 25%: {int((occ > 25).sum())}")

    vmax = 100.0
    q = C.quantize(occ, 0, vmax, "linear", valid=country)
    C.write_bin("flood", q)
    C.attach_stats("flood", occ, meta)
    C.upsert_layer({
        "id": "flood",
        "label": "Flood risk (water occurrence)",
        "unit": "% of time under water",
        "type": "raster",
        "min": 0,
        "max": vmax,
        "scale": "linear",
        "ramp": RAMP,
        "heightMode": "value",
        "heightScale": 0.5,
        "heightExponent": 1.3,
        "source": "JRC Global Surface Water 2021, monthly water occurrence",
        "sourceUrl": "https://global-surface-water.appspot.com/",
        "license": "Free, © European Commission JRC / Copernicus",
        "year": 2021,
    })

    print("[3/3] CHECKPOINT flood")
    doc = C.load_regions_doc()
    divs = sorted(((v["stats"]["flood"]["mean"] or 0, v["name"]) for v in doc), reverse=True)
    print("  by division:", [(n, round(m, 1)) for m, n in divs])
    dists = sorted(((d["stats"]["flood"]["mean"] or 0, d["name"], v["name"])
                    for v in doc for d in v["districts"]), reverse=True)
    print("  most flood-prone:", [(n, round(m, 1), dv) for m, n, dv in dists[:10]])
    assert any(dv in ("Barishal", "Khulna", "Dhaka") for _, _, dv in dists[:8])
    assert any(n in ("Sunamganj", "Kishoreganj", "Sylhet", "Netrokona") for _, n, _ in dists[:15]), \
        "haor basins should appear high on the list"
    C.report_sizes()


if __name__ == "__main__":
    main()
