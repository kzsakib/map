"""
PHASE 2.1 - forest & land use from ESA WorldCover 2021 v200 (10 m, COG on S3).

One download pass over the six 3x3 degree tiles that touch Bangladesh.
Each 0.01 deg grid cell is split into SUB x SUB sub-pixels (~200 m) and the
tile is read decimated with Resampling.nearest, so a 10 m global mosaic never
has to be materialised.

Outputs
    public/data/layers/forest.bin   % of cell covered by tree cover + mangrove
    public/data/layers/landuse.bin  dominant WorldCover class per cell (1..8)
    scripts/raw/worldcover_counts.npz  class counts, reused by rivers.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
TILES = ["N18E087", "N18E090", "N21E087", "N21E090", "N24E087", "N24E090"]
SUB = 20  # sub-pixels per grid cell -> 200 m

# every WorldCover class that occurs in Bangladesh is tracked, so the
# denominator of every fraction is the complete 10 m pixel count
ALL_CLASSES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]

# display categories: (label, colour, source classes)
LANDUSE = [
    ("Cropland", "#d9b46a", [40]),
    ("Trees", "#4f8a5b", [10, 20, 100]),
    ("Built-up", "#6b2038", [50]),
    ("Water", "#3d6fa8", [80]),
    ("Wetland", "#5fa8a0", [90]),
    ("Mangrove", "#1d4b3a", [95]),
    ("Grass / bare", "#cfc3a3", [30, 60, 70]),
]
LABEL_OF_ID = {i + 1: cat for i, cat in enumerate(LANDUSE)}

FOREST_RAMP = ["#f4f1e8", "#d7ead2", "#9cc79a", "#5b9a6b", "#2f6b4a", "#0f3d2e"]
LANDUSE_HEX = {i: cat[1] for i, cat in LABEL_OF_ID.items()}

ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_HTTP_VERSION": "2",
    "VSI_CACHE": "TRUE",
    "VSI_CACHE_SIZE": "134217728",
}


def tile_bounds(name: str):
    lat = int(name[1:3]) * (1 if name[0] == "N" else -1)
    lon = int(name[4:7])
    return lon, lat, lon + 3, lat + 3


def build_counts(meta: dict) -> tuple[np.ndarray, np.ndarray]:
    """Return (class_counts[cells, n_classes], covered_subpixels[cells])."""
    rows, cols = C.grid_shape(meta)
    x0, y0, x1, y1 = meta["bbox"]
    cell = meta["cellSizeDeg"]
    classes = ALL_CLASSES
    counts = np.zeros((rows, cols, len(classes)), dtype="uint16")
    covered = np.zeros((rows, cols), dtype="uint8")
    chunk = 40  # grid rows per read

    with rasterio.Env(**ENV):
        for tname in TILES:
            tx0, ty0, tx1, ty1 = tile_bounds(tname)
            ix0, ix1 = max(x0, tx0), min(x1, tx1)
            iy0, iy1 = max(y0, ty0), min(y1, ty1)
            if ix0 >= ix1 or iy0 >= iy1:
                continue
            c0 = int(round((ix0 - x0) / cell))
            c1 = int(round((ix1 - x0) / cell))
            r0 = int(round((y1 - iy1) / cell))
            r1 = int(round((y1 - iy0) / cell))
            url = f"/vsicurl/{BASE}/ESA_WorldCover_10m_2021_v200_{tname}_Map.tif"
            print(f"  tile {tname}: grid rows {r0}-{r1}, cols {c0}-{c1}")
            with rasterio.open(url) as src:
                tb = src.bounds
                for rs in range(r0, r1, chunk):
                    re = min(rs + chunk, r1)
                    # sub-pixel window of this tile clipped to the grid block
                    sx0 = max(ix0, x0 + c0 * cell)
                    sx1 = min(ix1, x0 + c1 * cell)
                    sy0 = max(iy0, y1 - re * cell)
                    sy1 = min(iy1, y1 - rs * cell)
                    win = from_bounds(sx0, sy0, sx1, sy1, transform=src.transform)
                    h = re - rs
                    w = c1 - c0
                    arr = src.read(1, window=win, out_shape=(h * SUB, w * SUB),
                                   resampling=Resampling.nearest)
                    block = arr.reshape(h, SUB, w, SUB)
                    sel = np.zeros((h, w), dtype="uint8")
                    for ci, cls in enumerate(classes):
                        cnt = (block == cls).sum(axis=(1, 3))
                        counts[rs:re, c0:c1, ci] += cnt.astype("uint16")
                        sel |= (cnt > 0).astype("uint8")
                    covered[rs:re, c0:c1] = np.maximum(covered[rs:re, c0:c1], sel)
                    del arr, block
            print(f"    accumulated {int(covered.sum())} sub-covered cells so far")
    return counts, covered


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    if not meta:
        raise SystemExit("run build_base.py first")
    dist_bin, _ = C.load_regions_bins(meta)
    country = dist_bin > 0
    rows, cols = C.grid_shape(meta)

    cache = C.RAW / "worldcover_counts.npz"
    if cache.exists():
        print(f"  cached {cache.name}")
        z = np.load(cache)
        counts, covered = z["counts"], z["covered"]
        assert counts.shape[2] == len(ALL_CLASSES), "stale cache: delete scripts/raw/worldcover_counts.npz"
    else:
        print("\n[1/3] reading WorldCover tiles")
        counts, covered = build_counts(meta)
        np.savez_compressed(cache, counts=counts, covered=covered)

    has_any = counts.sum(axis=2).astype("float64")
    valid = (has_any > 0) & country

    print("\n[2/3] forest")
    classes = ALL_CLASSES
    i_tree = classes.index(10)
    i_mang = classes.index(95)
    forest_pct = np.where(valid, (counts[:, :, i_tree] + counts[:, :, i_mang]) / np.maximum(has_any, 1) * 100, np.nan)
    forest_pct = np.clip(forest_pct, 0, 100)
    print(f"  forest %: mean {np.nanmean(forest_pct[valid]):.1f}  max {np.nanmax(forest_pct):.1f}")
    vmax_f = 100.0
    q = C.quantize(forest_pct, 0, vmax_f, "linear", valid=valid)
    C.write_bin("forest", q)
    C.attach_stats("forest", forest_pct, meta)
    C.upsert_layer({
        "id": "forest",
        "label": "Forest & tree cover",
        "unit": "% of cell",
        "type": "raster",
        "min": 0,
        "max": vmax_f,
        "scale": "linear",
        "ramp": FOREST_RAMP,
        "heightMode": "value",
        "heightScale": 0.55,
        "heightExponent": 1.6,
        "source": "ESA WorldCover 2021 v200, classes 10 (tree cover) + 95 (mangroves)",
        "sourceUrl": "https://esa-worldcover.org",
        "license": "CC BY 4.0",
        "year": 2021,
    })

    print("\n[3/3] land use")
    # sum the source classes into display categories, then take the dominant one
    cat_counts = np.zeros((rows, cols, len(LANDUSE)), dtype="uint32")
    for ci, (_, _, src) in enumerate(LANDUSE):
        for cls in src:
            cat_counts[:, :, ci] += counts[:, :, classes.index(cls)]
    dominant = np.argmax(cat_counts, axis=2)
    lu = np.where(valid, dominant + 1, np.nan).astype("float64")
    q = C.quantize(lu, 1, 8, "linear", valid=valid)
    # categorical: keep the class id verbatim so the shader can look it up exactly
    q = np.where(valid, lu, 0).astype(np.uint8)
    C.write_bin("landuse", q)

    stat_dist, stat_div = C.load_regions_bins(meta)

    def landuse_extra(arr, region, _meta):
        """A class layer needs a mode, not a mean."""
        raster = stat_div if "districts" in region else stat_dist
        vals = arr[(raster == region["id"]) & np.isfinite(arr)]
        if vals.size == 0:
            return {}
        counts = np.bincount(vals.astype("int64"), minlength=9)
        return {"dominant": int(np.argmax(counts))}

    C.attach_stats("landuse", lu, meta, extra_fn=landuse_extra)
    shares = {LABEL_OF_ID[i][0]: round(float(((lu == i) & valid).sum() / valid.sum() * 100), 1)
              for i in LABEL_OF_ID}
    print(f"  land cover shares: {shares}")
    C.upsert_layer({
        "id": "landuse",
        "label": "Land use",
        "unit": "dominant class",
        "type": "categorical",
        "min": 1,
        "max": 8,
        "scale": "linear",
        "ramp": [LANDUSE_HEX[i] for i in sorted(LANDUSE_HEX)],
        "classes": [{"id": i, "label": LABEL_OF_ID[i][0], "color": LABEL_OF_ID[i][1], "code": LABEL_OF_ID[i][2]}
                    for i in sorted(LABEL_OF_ID)],
        "heightMode": "flat",
        "heightScale": 0.012,
        "heightExponent": 1.0,
        "source": "ESA WorldCover 2021 v200, dominant class per 1 km cell",
        "sourceUrl": "https://esa-worldcover.org",
        "license": "CC BY 4.0",
        "year": 2021,
    })

    print("\nCHECKPOINT forest/landuse")
    doc = C.load_regions_doc()
    fdiv = sorted(((v["stats"]["forest"]["mean"] or 0, v["name"]) for v in doc), reverse=True)
    print("  forest by division:", [(n, round(m, 1)) for m, n in fdiv])
    top_d = sorted(((d["stats"]["forest"]["mean"] or 0, d["name"], v["name"])
                    for v in doc for d in v["districts"]), reverse=True)[:8]
    print("  forest by district:", [(n, round(m, 1), dv) for m, n, dv in top_d])
    # built-up share per division from the land use categories
    div_bin = C.read_bin("divisions", meta)
    built = {}
    for v in doc:
        mask = (div_bin == v["id"]) & country
        built[v["name"]] = round(float(((lu == 3) & mask).sum() / max(mask.sum(), 1) * 100), 1)
    print("  built-up share by division:", built)
    assert fdiv[0][1] in ("Khulna", "Chattogram"), f"forest should peak in the hills or the Sundarbans: {fdiv[:2]}"
    assert sum(1 for _, n, _ in top_d[:5]
               if n in ("Bandarban", "Rangamati", "Khagrachhari")) >= 2, f"hill tracts missing: {top_d[:5]}"
    assert any(n == "Bagerhat" for _, n, _ in top_d[:10]), "Sundarbans (Bagerhat) should be in the top 10"
    assert max(built, key=built.get) == "Dhaka", "built-up should peak around Dhaka"
    C.report_sizes()


if __name__ == "__main__":
    main()
