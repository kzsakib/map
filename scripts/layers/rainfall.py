"""
PHASE 2.4 - annual rainfall.

WorldClim 2.1 ships bio_12 only inside a ~10 GB global archive, but bio_12 is
by definition the sum of the twelve 30 arc-second monthly precipitation grids
(`wc2.1_30s_prec.zip`, 1 GB). We sum those twelve, which is the same number
with a download that fits.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from rasterio.warp import reproject

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

ZIP_URL = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_30s_prec.zip"
RAMP = ["#f6f3e4", "#d5e6ee", "#9cc6dd", "#5f9fc4", "#3f6fae", "#6b4fa0"]


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    dist_bin, _ = C.load_regions_bins(meta)
    country = dist_bin > 0
    rows, cols = C.grid_shape(meta)
    x0, y0, x1, y1 = meta["bbox"]

    print("[1/3] WorldClim 2.1 monthly precipitation (30 arc-second)")
    zp = C.download(ZIP_URL, C.RAW / "wc2.1_30s_prec.zip", "WorldClim prec")
    out_dir = C.RAW / "worldclim"
    tifs = sorted(out_dir.rglob("*.tif"))
    if len(tifs) < 12:
        print(f"  extracting {zp.name}")
        with zipfile.ZipFile(zp) as z:
            z.extractall(out_dir)
        tifs = sorted(out_dir.rglob("*.tif"))
    print(f"  {len(tifs)} monthly grids")

    transform = C.grid_transform(meta)
    total = np.zeros((rows, cols), dtype="float32")
    for i, tif in enumerate(tifs, 1):
        with rasterio.open(tif) as src:
            win = from_bounds(x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5, src.transform)
            arr = src.read(1, window=win).astype("float32")
            wt = src.window_transform(win)
            nodata = src.nodata
        if nodata is not None:
            arr[arr == nodata] = np.nan
        dst = np.zeros((rows, cols), dtype="float32")
        reproject(source=arr, destination=dst, src_transform=wt,
                  src_crs="EPSG:4326", dst_transform=transform,
                  dst_crs=C.WGS84, resampling=Resampling.average,
                  src_nodata=np.nan, dst_nodata=0.0)
        total += dst
        print(f"    month {i:02d}: mean so far {np.nanmean(total):.0f}")

    mm = np.where(country, total, np.nan)
    print(f"[2/3] annual rainfall mm: min {np.nanmin(mm):.0f}  "
          f"mean {np.nanmean(mm):.0f}  max {np.nanmax(mm):.0f}")

    vmax = 5000.0
    q = C.quantize(mm, 0, vmax, "linear", valid=country)
    C.write_bin("rainfall", q)
    C.attach_stats("rainfall", mm, meta)
    C.upsert_layer({
        "id": "rainfall",
        "label": "Annual rainfall",
        "unit": "mm / year",
        "type": "raster",
        "min": 0,
        "max": vmax,
        "scale": "linear",
        "ramp": RAMP,
        "heightMode": "value",
        "heightScale": 0.6,
        "heightExponent": 1.2,
        "source": "WorldClim 2.1 (bio_12 annual precipitation, summed from monthly, 30 arc-second)",
        "sourceUrl": "https://www.worldclim.org/data/worldclim21.html",
        "license": "CC BY 4.0 (WorldClim 2.1)",
        "year": 2020,
    })

    print("[3/3] CHECKPOINT rainfall")
    doc = C.load_regions_doc()
    divs = sorted(((v["stats"]["rainfall"]["mean"] or 0, v["name"]) for v in doc), reverse=True)
    print("  by division:", [(n, round(m, 0)) for m, n in divs])
    dists = sorted(((d["stats"]["rainfall"]["mean"] or 0, d["name"], v["name"])
                    for v in doc for d in v["districts"]), reverse=True)
    print("  wettest:", [(n, round(m, 0)) for m, n, _ in dists[:5]])
    print("  driest :", [(n, round(m, 0)) for m, n, _ in dists[-5:]])
    assert divs[0][1] == "Sylhet", f"expected Sylhet wettest, got {divs[0]}"
    assert divs[-1][1] in ("Rajshahi", "Rangpur"), f"expected a dry northwest, got {divs[-1]}"
    assert any(n in ("Cox's Bazar", "Chattogram", "Bandarban") for _, n, _ in dists[:8])
    C.report_sizes()


if __name__ == "__main__":
    main()
