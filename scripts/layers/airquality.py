"""
PHASE 2.5 - air quality: ACAG SatPM2.5 V6.GL.02.04, annual mean, 0.01 deg.

Source: s3://satpmdata/archive/V6GL0204/CNNPM25/Annual/AS/... (public, no login)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

NC_URL = ("https://satpmdata.s3.amazonaws.com/archive/V6GL0204/CNNPM25/Annual/AS/"
          "V6GL02.04.CNNPM25.AS.202301-202312.nc")
RAMP = ["#faf6ea", "#f2d79a", "#e9a95c", "#d9694f", "#a63a58", "#3b1250"]


def load_band(nc: Path):
    import xarray as xr

    ds = xr.open_dataset(nc)
    name = None
    for cand in ("PM25", "GWRPM25", "pm25", "Band1"):
        if cand in ds:
            name = cand
            break
    if name is None:
        name = [v for v in ds.data_vars if ds[v].ndim >= 2][0]
    da = ds[name]
    for dim in list(da.dims):
        if dim not in ("lat", "lon"):
            da = da.isel({dim: 0})
    lat_name = "lat" if "lat" in da.dims else "latitude"
    lon_name = "lon" if "lon" in da.dims else "longitude"
    lats = np.asarray(da[lat_name].values, dtype="float64")
    lons = np.asarray(da[lon_name].values, dtype="float64")
    arr = np.asarray(da.transpose(lat_name, lon_name).values, dtype="float32")
    arr = np.where(arr < -100, np.nan, arr)
    # CF files store lat ascending (south first); rasterio needs row 0 = north
    if lats[0] < lats[-1]:
        lats, arr = lats[::-1], arr[::-1, :]
    if lons[0] > lons[-1]:
        lons, arr = lons[::-1], arr[:, ::-1]
    dlat = abs(lats[1] - lats[0])
    dlon = abs(lons[1] - lons[0])
    transform = from_origin(lons[0] - dlon / 2, lats[0] + dlat / 2, dlon, dlat)
    print(f"  {name}: {arr.shape} @ {dlon:.4f} deg, "
          f"lat {lats.min():.2f}-{lats.max():.2f}, lon {lons.min():.2f}-{lons.max():.2f}")
    return arr, transform


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    dist_bin, _ = C.load_regions_bins(meta)
    country = dist_bin > 0
    rows, cols = C.grid_shape(meta)

    print("[1/3] ACAG V6.GL.02.04 PM2.5 (2023)")
    nc = C.download(NC_URL, C.RAW / "V6GL02.04.CNNPM25.AS.202301-202312.nc", "ACAG PM2.5")
    arr, src_transform = load_band(nc)
    out = np.full((rows, cols), np.nan, dtype="float32")
    reproject(source=arr, destination=out, src_transform=src_transform,
              src_crs="EPSG:4326", dst_transform=C.grid_transform(meta),
              dst_crs=C.WGS84, resampling=Resampling.bilinear,
              src_nodata=np.nan, dst_nodata=np.nan)
    pm = np.where(country & np.isfinite(out), np.clip(out, 0, 400), np.nan)
    print(f"[2/3] PM2.5 ug/m3: min {np.nanmin(pm):.1f}  mean {np.nanmean(pm):.1f}  "
          f"max {np.nanmax(pm):.1f}")

    vmax = float(min(np.ceil(np.nanmax(pm) / 10) * 10, 200))
    q = C.quantize(pm, 0, vmax, "linear", valid=country)
    C.write_bin("airquality", q)
    C.attach_stats("airquality", pm, meta)
    C.upsert_layer({
        "id": "airquality",
        "label": "Air quality (PM2.5)",
        "unit": "µg/m³",
        "type": "raster",
        "min": 0,
        "max": vmax,
        "scale": "linear",
        "ramp": RAMP,
        "heightMode": "value",
        "heightScale": 0.55,
        "heightExponent": 1.3,
        "source": "ACAG SatPM2.5 V6.GL.02.04, annual mean 2023, 0.01° CNN hybrid",
        "sourceUrl": "https://sites.wustl.edu/acag/datasets/surface-pm2-5/",
        "license": "CC BY 4.0",
        "year": 2023,
    })

    print("[3/3] CHECKPOINT air quality")
    doc = C.load_regions_doc()
    divs = sorted(((v["stats"]["airquality"]["mean"] or 0, v["name"]) for v in doc), reverse=True)
    print("  by division:", [(n, round(m, 1)) for m, n in divs])
    dists = sorted(((d["stats"]["airquality"]["mean"] or 0, d["name"], v["name"])
                    for v in doc for d in v["districts"]), reverse=True)
    print("  worst:", [(n, round(m, 1), dv) for m, n, dv in dists[:6]])
    assert divs[0][1] == "Dhaka", f"expected Dhaka worst, got {divs[0]}"
    assert dists[0][1] == "Dhaka", f"expected Dhaka district worst, got {dists[0]}"
    assert divs[-1][1] in ("Sylhet", "Chattogram", "Barishal"), f"the wet hills should be cleanest: {divs[-1]}"
    C.report_sizes()


if __name__ == "__main__":
    main()
