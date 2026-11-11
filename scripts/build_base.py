"""
PHASE 1 - base data: boundaries, master grid, districts, population.

Run:  .venv/bin/python scripts/build_base.py
Out:  public/data/{meta.json,regions.bin,divisions.bin,regions.json,
                   outline.geojson,cities.json,layers.json,layers/population.bin}
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from pyproj import Geod
from rasterio.features import rasterize
from rasterio.enums import Resampling
from rasterio.warp import reproject
from shapely.geometry import mapping
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

GEOD = Geod(ellps="WGS84")

CITIES = [
    ("Dhaka", 23.8103, 90.4125),
    ("Chattogram", 22.3569, 91.7832),
    ("Khulna", 22.8456, 89.5403),
    ("Rajshahi", 24.3745, 88.6042),
    ("Sylhet", 24.8949, 91.8687),
    ("Barishal", 22.7010, 90.3535),
    ("Rangpur", 25.7439, 89.2752),
    ("Mymensingh", 24.7471, 90.4203),
]

POP_RAMP = ["#ddd6fe", "#c4b5fd", "#f9a8d4", "#f472b6", "#e05a6b", "#8d1f4a", "#3b0a1e"]

# geoBoundaries/BBS still ship the pre-2018 spellings; use the official names.
DIVISION_FIX = {"Barisal": "Barishal", "Chittagong": "Chattogram", "Rajshani": "Rajshahi"}
DISTRICT_FIX = {
    "Barisal": "Barishal", "Chittagong": "Chattogram", "Comilla": "Cumilla",
    "Jessore": "Jashore", "Bogra": "Bogura", "Brahamanbaria": "Brahmanbaria",
    "Netrakona": "Netrokona", "Maulvibazar": "Moulvibazar",
    "Nawabganj": "Chapainawabganj", "Jhalokati": "Jhalokathi",
    "Chuadanga": "Chuadanga", "Panchagarh": "Panchagarh",
}


def fetch_boundaries() -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    import requests

    frames = {}
    for level in ("ADM1", "ADM2"):
        api = f"https://www.geoboundaries.org/api/current/gbOpen/BGD/{level}/"
        print(f"  api   {api}")
        r = requests.get(api, timeout=90)
        r.raise_for_status()
        info = r.json()
        if isinstance(info, list):
            info = info[0]
        url = info.get("simplifiedGeometryGeoJSON") or info.get("gjDownloadURL")
        print(f"  src   {level}: {url}  ({info.get('boundarySource')})")
        dest = C.RAW / f"bgd_{level.lower()}_simplified.geojson"
        C.download(url, dest, label=f"geoBoundaries {level}")
        frames[level] = gpd.read_file(dest).to_crs(4326)
    return frames["ADM1"], frames["ADM2"]


def build_outline(adm1: gpd.GeoDataFrame):
    union = unary_union([g.buffer(0) if not g.is_valid else g for g in adm1.geometry])
    simplified = union.simplify(0.001, preserve_topology=True)
    return union, simplified


def geod_area_km2(geom) -> float:
    area, _ = GEOD.geometry_area_perimeter(geom)
    return round(abs(area) / 1e6, 1)


def main() -> None:
    C.ensure_dirs()
    print("\n[1/8] boundaries")
    adm1, adm2 = fetch_boundaries()

    name_col = "shapeName"
    adm1 = adm1.rename(columns={name_col: "name"}) if name_col in adm1.columns else adm1
    adm2 = adm2.rename(columns={name_col: "name"}) if name_col in adm2.columns else adm2
    if "name" not in adm1.columns:
        raise SystemExit(f"unexpected ADM1 columns: {list(adm1.columns)}")
    adm1["name"] = adm1["name"].replace(DIVISION_FIX)
    adm2["name"] = adm2["name"].replace(DISTRICT_FIX)
    print(f"  ADM1: {len(adm1)} features -> {sorted(adm1['name'])}")
    print(f"  ADM2: {len(adm2)} features -> {sorted(adm2['name'])}")

    print("\n[2/8] outline + master grid")
    union, outline = build_outline(adm1)
    meta = C.grid_from_bounds(outline.bounds)
    print(f"  outline bounds {tuple(round(b, 3) for b in outline.bounds)}")
    print(f"  grid {meta['cols']} x {meta['rows']} @ {meta['cellSizeDeg']} deg  bbox={meta['bbox']}")
    C.save_json(C.DATA / "meta.json", meta)

    print("\n[3/8] district -> division mapping")
    adm1 = adm1.sort_values("name").reset_index(drop=True)
    adm1["id"] = np.arange(1, len(adm1) + 1)
    div_of = dict(zip(adm1["name"], adm1["id"]))
    print(f"  divisions: {div_of}")

    adm2 = adm2.sort_values("name").reset_index(drop=True)
    adm2["id"] = np.arange(1, len(adm2) + 1)
    adm2["geometry"] = [g.buffer(0) if not g.is_valid else g for g in adm2.geometry]
    pts = adm2.copy()
    pts["geometry"] = pts.geometry.representative_point()
    joined = gpd.sjoin(pts, adm1[["id", "name", "geometry"]], how="left", predicate="within")
    joined = joined[~joined.index.duplicated(keep="first")]
    adm2["division_id"] = joined["id_right"].fillna(0).astype(int).values
    missing = adm2[adm2["division_id"] == 0]
    if len(missing):
        print(f"  ! {len(missing)} districts outside any division, snapping by centroid")
        for idx in missing.index:
            pt = adm2.loc[idx].geometry.representative_point()
            dists = adm1.geometry.distance(pt)
            adm2.loc[idx, "division_id"] = int(adm1.loc[dists.idxmin(), "id"])
    div_name_by_id = dict(zip(adm1["id"], adm1["name"]))
    adm2["division_name"] = adm2["division_id"].map(div_name_by_id)
    print(f"  districts per division: "
          f"{adm2.groupby('division_name').size().to_dict()}")

    print("\n[4/8] rasterise regions")
    transform = C.grid_transform(meta)
    shape = C.grid_shape(meta)

    dist_bin = rasterize(
        ((g, int(i)) for g, i in zip(adm2.geometry, adm2["id"])),
        out_shape=shape, transform=transform, fill=0, dtype="uint8",
        all_touched=True,
    )
    # keep only cells inside the national outline
    inside = rasterize([(outline, 1)], out_shape=shape, transform=transform,
                       fill=0, dtype="uint8", all_touched=True)
    dist_bin = np.where(inside > 0, dist_bin, 0).astype(np.uint8)

    found = np.unique(dist_bin)
    missing_ids = sorted(set(adm2["id"]) - set(int(v) for v in found if v))
    if missing_ids:
        print(f"  ! districts with no cell: {missing_ids} -> retry all_touched")
        for did in missing_ids:
            geom = adm2.loc[adm2["id"] == did, "geometry"].iloc[0]
            patch = rasterize([(geom, 1)], out_shape=shape, transform=transform,
                              fill=0, dtype="uint8", all_touched=True)
            dist_bin = np.where((dist_bin == 0) & (patch > 0), did, dist_bin).astype(np.uint8)

    div_lut = np.zeros(256, dtype="uint8")
    for _, row in adm2.iterrows():
        div_lut[int(row["id"])] = int(row["division_id"])
    div_bin = div_lut[dist_bin]

    inside_cells = int((dist_bin > 0).sum())
    print(f"  country cells: {inside_cells} of {shape[0] * shape[1]} "
          f"({100 * inside_cells / (shape[0] * shape[1]):.1f}%)")
    C.write_bin("regions", dist_bin, C.DATA)
    C.write_bin("divisions", div_bin, C.DATA)

    print("\n[5/8] population (WorldPop BGD 2020, 1 km)")
    url = ("https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/"
           "BGD/bgd_ppp_2020_1km_Aggregated.tif")
    tif = C.download(url, C.RAW / "bgd_ppp_2020_1km_Aggregated.tif", "WorldPop ppp 2020")
    with rasterio.open(tif) as src:
        ppp = src.read(1).astype("float64")
        nodata = src.nodata
        src_transform = src.transform
        src_crs = src.crs
        if nodata is not None:
            ppp[ppp == nodata] = np.nan
        ppp[ppp < 0] = np.nan
        rows_src, cols_src = ppp.shape
        dlon = abs(src_transform.a)
        dlat = abs(src_transform.e)
        lat_centres = src_transform.f + src_transform.e * (np.arange(rows_src) + 0.5)
        area = (dlat * 111.132) * (dlon * 111.320 * np.cos(np.radians(lat_centres)))
        area2d = np.repeat(area[:, None], cols_src, axis=1)
        density = ppp / area2d
        print(f"  source {cols_src}x{rows_src} @ {dlon:.5f} deg, "
              f"pixel area {np.nanmin(area2d):.3f}-{np.nanmax(area2d):.3f} km2")

    out = np.full(shape, np.nan, dtype="float32")
    reproject(source=density.astype("float32"), destination=out,
              src_transform=src_transform, src_crs=src_crs,
              dst_transform=transform, dst_crs=C.WGS84,
              resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)

    country = dist_bin > 0
    out = np.where(country, np.nan_to_num(out, nan=0.0), np.nan)
    out[out < 0] = 0.0
    raw_max = float(np.nanmax(out[country]))
    vmax = round(raw_max, 1)
    print(f"  density km2: min {np.nanmin(out[country]):.1f}  "
          f"median {np.nanmedian(out[country]):.1f}  "
          f"p99.9 {np.nanpercentile(out[country], 99.9):.1f}  max {vmax:.1f}")
    # clamp only floating-point overshoot so the stored statistics stay inside
    # the quantisation domain the texture can represent
    out = np.where(country, np.minimum(out, vmax), np.nan)
    q = C.quantize(out, 0.0, vmax, "log", valid=country)
    size = C.write_bin("population", q)
    print(f"  layers/population.bin {size / 1e3:.0f} kB")

    print("\n[6/8] regions.json")
    cell_area = C.grid_cell_areas_km2(meta)

    def pop_stats(arr, region, meta):
        """Population = sum(density * cell area) for the region's cells."""
        if region.get("divisionId"):
            mask = div_bin == region["id"]
        else:
            mask = dist_bin == region["id"]
        vals = np.where(mask, np.nan_to_num(arr, nan=0.0), 0.0)
        return {"population": int(round(float((vals * cell_area).sum())))}

    divisions = []
    for _, drow in adm1.iterrows():
        geom = union if False else drow.geometry
        c = geom.representative_point()
        districts = []
        for _, srow in adm2[adm2["division_id"] == drow["id"]].iterrows():
            sc = srow.geometry.representative_point()
            districts.append({
                "id": int(srow["id"]),
                "name": srow["name"],
                "divisionId": int(drow["id"]),
                "divisionName": drow["name"],
                "bbox": [round(v, 4) for v in srow.geometry.bounds],
                "centroid": [round(sc.y, 4), round(sc.x, 4)],
                "areaKm2": geod_area_km2(srow.geometry),
                "stats": {},
            })
        divisions.append({
            "id": int(drow["id"]),
            "name": drow["name"],
            "bbox": [round(v, 4) for v in geom.bounds],
            "centroid": [round(c.y, 4), round(c.x, 4)],
            "areaKm2": geod_area_km2(geom),
            "divisionId": int(drow["id"]),
            "stats": {},
            "districts": districts,
        })
    C.save_json(C.regions_path(), divisions)

    # stats (population first; every later layer script calls attach_stats)
    C.attach_stats("population", out, meta, extra_fn=pop_stats)
    C.upsert_layer({
        "id": "population",
        "label": "Population density",
        "unit": "people / km²",
        "type": "raster",
        "min": 0,
        "max": vmax,
        "scale": "log",
        "ramp": POP_RAMP,
        "heightMode": "value",
        "heightScale": 1.0,
        "heightExponent": 1.4,
        "source": "WorldPop 2020, 1 km unconstrained population per pixel",
        "sourceUrl": "https://hub.worldpop.org/geodata/summary?id=24873",
        "license": "CC BY 4.0",
        "year": 2020,
        "quantization": "q1..255 = log1p(density)/log1p(max)",
    })

    print("\n[7/8] outline + cities")
    C.save_json(C.DATA / "outline.geojson", {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"name": "Bangladesh"},
                      "geometry": mapping(outline)}],
    })
    C.save_json(C.DATA / "cities.json",
                [{"name": n, "lat": la, "lon": lo} for n, la, lo in CITIES])

    print("\n[8/8] checkpoint")
    doc = C.load_regions_doc()
    print(f"  divisions: {len(doc)}   districts: {sum(len(d['districts']) for d in doc)}")
    pops = sorted(((d["stats"]["population"]["population"], d["name"]) for d in doc),
                  reverse=True)
    for p, n in pops:
        print(f"    {n:<12} {p / 1e6:6.2f} M  (area {next(d['areaKm2'] for d in doc if d['name'] == n):>8.0f} km²)")
    all_d = [(s["stats"]["population"]["max"], s["name"]) for d in doc for s in d["districts"]]
    all_d.sort(reverse=True)
    print("  peak density districts:", [(n, round(v, 0)) for v, n in all_d[:5]])
    total = sum(p for p, _ in pops)
    print(f"  national sum: {total / 1e6:.1f} M (WorldPop estimate)")
    C.report_sizes()
    assert len(doc) == 8, "expected 8 divisions"
    assert sum(len(d["districts"]) for d in doc) == 64, "expected 64 districts"
    assert pops[0][1] == "Dhaka", "Dhaka division should have the largest population"
    assert all_d[0][1] == "Dhaka", "Dhaka district should have the peak density"
    assert C.data_bytes() < 4e6, "data budget exceeded"


if __name__ == "__main__":
    main()
