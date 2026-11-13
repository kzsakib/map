"""
STEP 1 - bake the terrain assets for the relief render.

Reads the Copernicus DEM GLO-90 tiles already cached in scripts/raw/dem and
writes a separate, higher-resolution terrain grid (independent of the 1 km data
grid) to public/data/terrain/.

Outputs
    height.png      16-bit elevation packed into 8-bit RG (R = high, G = low)
    terrain.json    { minElev, maxElev, cols, rows, bbox }
    hillshade.webp  multi-azimuth hillshade of the EXAGGERATED elevation
    ao.webp         horizon-angle ambient occlusion, same exaggeration
    water.webp      water mask (WorldCover class 80 proxy + HydroRIVERS lines)
    mask.webp       antialiased country mask

Everything is numpy + Pillow: no GDAL/rasterio needed, because the DEM tiles are
named by their 1 degree bounds and load cleanly through Pillow.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
RAW = ROOT / "scripts" / "raw"
OUT = DATA / "terrain"
REVIEW = ROOT / "review" / "step-1"

# terrain grid: ~430 px per degree, well above the 1 km data grid
WIDTH = 2048
EXAGGERATION = 12.0
TILE_RE = re.compile(r"_([NS])(\d{2})_00_([EW])(\d{3})_00_DEM\.tif$")


def lonlat_bounds(name: str):
    m = TILE_RE.search(name)
    if not m:
        return None
    ns, lat, ew, lon = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
    y0 = lat if ns == "N" else -lat
    x0 = lon if ew == "E" else -lon
    return x0, y0, x0 + 1.0, y0 + 1.0


def load_meta():
    return json.loads((DATA / "meta.json").read_text())


def mosaic_dem(bbox, shape):
    """Downsample each 1 degree tile into its place on the target grid."""
    x0, y0, x1, y1 = bbox
    H, W = shape
    acc = np.zeros((H, W), dtype=np.float32)
    cnt = np.zeros((H, W), dtype=np.uint16)

    per_deg_x = W / (x1 - x0)
    per_deg_y = H / (y1 - y0)

    tiles = sorted((RAW / "dem").glob("*.tif"))
    used = 0
    for path in tiles:
        tb = lonlat_bounds(path.name)
        if tb is None:
            continue
        tx0, ty0, tx1, ty1 = tb
        if tx1 <= x0 or tx0 >= x1 or ty1 <= y0 or ty0 >= y1:
            continue
        try:
            im = Image.open(path)
            im.load()
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {path.name}: {exc}")
            continue
        arr = np.array(im, dtype=np.float32, copy=True)
        arr[arr < -100] = np.nan

        # integer pixel window on the target grid
        c0 = int(math.floor((max(tx0, x0) - x0) * per_deg_x))
        c1 = int(math.ceil((min(tx1, x1) - x0) * per_deg_x))
        r0 = int(math.floor((y1 - min(ty1, y1)) * per_deg_y))
        r1 = int(math.ceil((y1 - max(ty0, y0)) * per_deg_y))
        c0, c1 = max(0, c0), min(W, c1)
        r0, r1 = max(0, r0), min(H, r1)
        if c1 - c0 < 2 or r1 - r0 < 2:
            continue

        # crop the tile to the part that is inside the country bbox
        fc0 = (max(tx0, x0) - tx0) / (tx1 - tx0) * arr.shape[1]
        fc1 = (min(tx1, x1) - tx0) / (tx1 - tx0) * arr.shape[1]
        fr0 = (ty1 - min(ty1, y1)) / (ty1 - ty0) * arr.shape[0]
        fr1 = (ty1 - max(ty0, y0)) / (ty1 - ty0) * arr.shape[0]
        crop = arr[int(fr0) : int(math.ceil(fr1)), int(fc0) : int(math.ceil(fc1))]

        resized = np.asarray(
            Image.fromarray(crop, mode="F").resize((c1 - c0, r1 - r0), Image.LANCZOS),
            dtype=np.float32,
        )
        good = np.isfinite(resized)
        acc[r0:r1, c0:c1] += np.where(good, resized, 0.0)
        cnt[r0:r1, c0:c1] += good.astype(np.uint16)
        used += 1
    print(f"  mosaicked {used} DEM tiles")
    cnt_safe = np.maximum(cnt, 1)
    dem = acc / cnt_safe
    dem[cnt == 0] = np.nan
    return dem


def gaussian(arr, sigma):
    """Separable gaussian blur on a float array (edge-clamped)."""
    radius = max(1, int(round(sigma * 3)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-(x**2) / (2 * sigma * sigma))
    k /= k.sum()
    pad = radius
    a = np.pad(arr, ((pad, pad), (0, 0)), mode="edge")
    a = sum(k[i] * a[i : i + arr.shape[0], :] for i in range(len(k)))
    a = np.pad(a, ((0, 0), (pad, pad)), mode="edge")
    a = sum(k[i] * a[:, i : i + arr.shape[1]] for i in range(len(k)))
    return a


def rasterize_outline(bbox, shape):
    """Antialiased country mask from the shipped outline, drawn at 2x then reduced."""
    x0, y0, x1, y1 = bbox
    H, W = shape
    scale = 2
    big = Image.new("L", (W * scale, H * scale), 0)
    draw = ImageDraw.Draw(big)
    outline = json.loads((DATA / "outline.geojson").read_text())
    for feat in outline["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            for ring in poly:
                # every ring is filled: the outline's interior rings are tiny
                # enclaves, and punching them leaves holes in the terrain slab
                pts = [
                    (
                        (lon - x0) / (x1 - x0) * W * scale,
                        (y1 - lat) / (y1 - y0) * H * scale,
                    )
                    for lon, lat in ring
                ]
                if len(pts) < 3:
                    continue
                draw.polygon(pts, fill=255)
    small = big.resize((W, H), Image.LANCZOS)
    return np.asarray(small, dtype=np.float32) / 255.0


def hillshade(elev, px_m, exaggeration):
    z = elev * exaggeration
    gy, gx = np.gradient(z, px_m, px_m)
    nx, ny, nz = -gx, -gy, np.ones_like(z)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / norm, ny / norm, nz / norm

    shade = np.zeros_like(z)
    for az, alt, w in ((315, 45, 0.5), (270, 35, 0.25), (360, 45, 0.25)):
        a = math.radians(az)
        h = math.radians(alt)
        lx = math.sin(a) * math.cos(h)
        ly = math.cos(a) * math.cos(h)
        lz = math.sin(h)
        shade += w * np.clip(nx * lx + ny * ly + nz * lz, 0.0, 1.0)
    return shade


def ambient_occlusion(elev, px_m, exaggeration, directions=8, radii=(6, 12, 20, 30, 42)):
    z = elev * exaggeration
    H, W = z.shape
    total = np.zeros_like(z)
    for d in range(directions):
        ang = 2 * math.pi * d / directions
        dx = math.cos(ang)
        dy = math.sin(ang)
        horizon = np.zeros_like(z)
        for r in radii:
            sx = int(round(dx * r))
            sy = int(round(dy * r))
            shifted = np.full_like(z, -1e6)
            ys0, ys1 = max(0, sy), H + min(0, sy)
            yd0, yd1 = max(0, -sy), H + min(0, -sy)
            xs0, xs1 = max(0, sx), W + min(0, sx)
            xd0, xd1 = max(0, -sx), W + min(0, -sx)
            shifted[yd0:yd1, xd0:xd1] = z[ys0:ys1, xs0:xs1]
            slope = (shifted - z) / (r * px_m)
            horizon = np.maximum(horizon, slope)
        total += 1.0 - np.clip(horizon * 2.2, 0.0, 1.0)
    ao = total / directions
    return np.clip(ao, 0.0, 1.0)


def build_water(bbox, shape, mask):
    """WorldCover class 80 proxy (1 km land-use water) + the HydroRIVERS network."""
    H, W = shape
    x0, y0, x1, y1 = bbox
    water = np.zeros((H, W), dtype=np.float32)

    lu_path = DATA / "layers" / "landuse.bin"
    if lu_path.exists():
        meta = json.loads((DATA / "meta.json").read_text())
        cols, rows = meta["cols"], meta["rows"]
        lu = np.fromfile(lu_path, dtype=np.uint8).reshape(rows, cols)
        w1 = (lu == 4).astype(np.float32)
        water = np.maximum(
            water,
            np.asarray(
                Image.fromarray(w1, mode="F").resize((W, H), Image.BILINEAR), dtype=np.float32
            ),
        )

    rv_path = DATA / "layers" / "rivers.bin"
    if rv_path.exists():
        meta = json.loads((DATA / "meta.json").read_text())
        cols, rows = meta["cols"], meta["rows"]
        rv = np.fromfile(rv_path, dtype=np.uint8).reshape(rows, cols).astype(np.float32) / 255.0
        water = np.maximum(
            water,
            np.asarray(Image.fromarray(rv, mode="F").resize((W, H), Image.BILINEAR), dtype=np.float32)
            * 1.6,
        )

    # draw the river lines so the braids survive the downsampling
    rivers = json.loads((DATA / "rivers.geojson").read_text())
    line_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(line_img)
    qs = [f["properties"]["q"] for f in rivers["features"]]
    qmax = max(qs) if qs else 1
    for feat in rivers["features"]:
        q = feat["properties"]["q"]
        width = 1 + int(round(4.5 * (q / qmax) ** 0.45))
        pts = [
            ((lon - x0) / (x1 - x0) * W, (y1 - lat) / (y1 - y0) * H)
            for lon, lat in feat["geometry"]["coordinates"]
        ]
        if len(pts) < 2:
            continue
        draw.line(pts, fill=255, width=width, joint="curve")
    lines = np.asarray(line_img, dtype=np.float32) / 255.0
    water = np.maximum(water, lines)

    water = gaussian(water, 1.2)
    water = np.clip(water, 0.0, 1.0) * mask
    return water


def to_u8(arr, lo=None, hi=None):
    lo = np.percentile(arr, 1) if lo is None else lo
    hi = np.percentile(arr, 99) if hi is None else hi
    if hi <= lo:
        hi = lo + 1e-6
    return np.clip((arr - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)

    meta = load_meta()
    bbox = meta["bbox"]
    x0, y0, x1, y1 = bbox
    H = int(round(WIDTH * (y1 - y0) / (x1 - x0)))
    shape = (H, WIDTH)
    print(f"[1/6] terrain grid {WIDTH} x {H}")

    mask = rasterize_outline(bbox, shape)
    print("  mask done")

    dem = mosaic_dem(bbox, shape)
    dem = np.where(np.isfinite(dem), dem, 0.0)
    dem = gaussian(dem, 1.0)
    dem *= np.clip(mask * 1.4, 0.0, 1.0)  # no stray elevations beyond the coast

    inside = mask > 0.5
    min_elev = float(np.floor(dem[inside].min()))
    max_elev = float(np.ceil(dem[inside].max()))
    print(f"[2/6] elevation {min_elev:.0f} .. {max_elev:.0f} m")

    lat_mid = math.radians((y0 + y1) / 2)
    px_m = ((x1 - x0) / WIDTH) * 111320.0 * math.cos(lat_mid)

    print("[3/6] hillshade")
    shade = hillshade(dem, px_m, EXAGGERATION)
    shade = gaussian(shade, 0.6)
    shade_u8 = to_u8(shade * mask, 0.05, 0.95)

    print("[4/6] ambient occlusion")
    ao = ambient_occlusion(dem, px_m, EXAGGERATION)
    ao = gaussian(ao, 1.0)
    ao_u8 = to_u8(ao * mask, 0.35, 1.0)

    print("[5/6] water")
    water = build_water(bbox, shape, mask)
    water_u8 = np.clip(water * 255.0, 0, 255).astype(np.uint8)

    mask_u8 = np.clip(mask * 255.0, 0, 255).astype(np.uint8)

    print("[6/6] writing")
    q = np.clip(dem - min_elev, 0, 65535).astype(np.uint16)
    rg = np.zeros((H, WIDTH, 3), dtype=np.uint8)
    rg[..., 0] = (q >> 8) & 0xFF
    rg[..., 1] = q & 0xFF
    rg[..., 2] = 0
    Image.fromarray(rg, "RGB").save(OUT / "height.png", optimize=True)

    Image.fromarray(shade_u8, "L").save(OUT / "hillshade.webp", quality=85, method=6)
    Image.fromarray(ao_u8, "L").save(OUT / "ao.webp", quality=85, method=6)
    Image.fromarray(water_u8, "L").save(OUT / "water.webp", quality=82, method=6)
    Image.fromarray(mask_u8, "L").save(OUT / "mask.webp", quality=85, method=6)

    (OUT / "terrain.json").write_text(
        json.dumps(
            {
                "minElev": min_elev,
                "maxElev": max_elev,
                "cols": WIDTH,
                "rows": H,
                "bbox": bbox,
                "exaggeration": EXAGGERATION,
            },
            indent=1,
        )
    )

    total = 0
    for name in ("height.png", "hillshade.webp", "ao.webp", "water.webp", "mask.webp", "terrain.json"):
        size = (OUT / name).stat().st_size
        total += size
        print(f"  {name:<16} {size/1024:8.1f} KB")
    print(f"  total            {total/1024/1024:8.2f} MB")

    # previews for review
    for name, arr in (
        ("hillshade", shade_u8),
        ("ao", ao_u8),
        ("water", water_u8),
        ("mask", mask_u8),
    ):
        im = Image.fromarray(arr, "L").resize((1000, int(1000 * H / WIDTH)), Image.LANCZOS)
        im.save(REVIEW / f"{name}.png")
    Image.fromarray(shade_u8, "L").save(REVIEW / "hillshade-full.png")


if __name__ == "__main__":
    main()
