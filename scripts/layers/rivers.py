"""
PHASE 2.3 - rivers: HydroRIVERS v10 lines + a WorldCover water raster.

The lines are what the map draws; the raster is the water mask the column
shader uses to sink channels slightly below the ground plane.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
from pyproj import Geod
from shapely.geometry import box, mapping

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common as C

GEOD = Geod(ellps="WGS84")
ZIP_URL = "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip"
RAMP = ["#fcfaf3", "#e6e2f7", "#b9b2ec", "#7a6ed6", "#4338ca", "#22d3ee"]


def main() -> None:
    C.ensure_dirs()
    meta = C.load_json(C.DATA / "meta.json")
    dist_bin, div_bin = C.load_regions_bins(meta)
    country = dist_bin > 0
    outline_doc = C.load_json(C.DATA / "outline.geojson")
    from shapely.geometry import shape

    outline = shape(outline_doc["features"][0]["geometry"])
    x0, y0, x1, y1 = meta["bbox"]

    print("[1/4] HydroRIVERS v10 Asia")
    zp = C.download(ZIP_URL, C.RAW / "HydroRIVERS_v10_as_shp.zip", "HydroRIVERS Asia")
    shp_dir = C.RAW / "hydrorivers"
    shp = next(shp_dir.rglob("HydroRIVERS_v10_as.shp"), None)
    if shp is None:
        with zipfile.ZipFile(zp) as z:
            z.extractall(shp_dir)
        shp = next(shp_dir.rglob("HydroRIVERS_v10_as.shp"))
    print(f"  shapefile {shp.name}")
    rivers = gpd.read_file(shp, bbox=(x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5)).to_crs(4326)
    print(f"  {len(rivers)} segments in the bounding box")

    rivers = rivers[rivers.geometry.intersects(outline)]
    rivers = rivers.copy()
    rivers["geometry"] = rivers.geometry.intersection(outline)
    rivers = rivers[~rivers.geometry.is_empty]

    # Strahler 4 keeps the delta readable (the Padma/Jamuna/Meghna are 7-9);
    # only raise it if the GeoJSON would blow the 600 kB budget
    order = 4
    keep = rivers[rivers["ORD_STRA"] >= order].copy()
    keep = keep[keep.geometry.length > 0.02]
    print(f"  ORD_STRA >= {order}: {len(keep)} segments")

    keep["km"] = keep.geometry.apply(lambda g: GEOD.geometry_length(g) / 1000.0)
    keep = keep[keep["km"] > 1.0]
    keep = keep.sort_values("DIS_AV_CMS", ascending=False)
    keep["geometry"] = keep.geometry.simplify(0.001, preserve_topology=False)
    total_km = float(keep["km"].sum())
    print(f"  total mapped network: {total_km:,.0f} km, "
          f"max discharge {keep['DIS_AV_CMS'].max():,.0f} m3/s")

    print("[2/4] rivers.geojson")

    def line_parts(geom):
        """Clipping can turn a LineString into a MultiLineString / GeometryCollection."""
        if geom.is_empty:
            return
        if geom.geom_type == "LineString":
            yield geom
        elif hasattr(geom, "geoms"):
            for part in geom.geoms:
                yield from line_parts(part)

    feats = []
    for _, row in keep.iterrows():
        props = {
            "k": int(row["HYRIV_ID"]),
            "o": int(row["ORD_STRA"]),
            "q": round(float(row["DIS_AV_CMS"]), 1),
            "l": round(float(row["km"]), 1),
        }
        for part in line_parts(row.geometry):
            coords = [[round(x, 4), round(y, 4)] for x, y in part.coords]
            if len(coords) < 2:
                continue
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "LineString", "coordinates": coords}})
    rivers_doc = {"type": "FeatureCollection", "features": feats}
    C.save_json(C.DATA / "rivers.geojson", rivers_doc)
    size_kb = (C.DATA / "rivers.geojson").stat().st_size / 1e3
    print(f"  {len(feats)} features, {size_kb:.0f} kB")
    while size_kb > 600 and order < 7:
        order += 1
        print(f"  ! over budget, dropping to ORD_STRA >= {order}")
        keep = rivers[rivers["ORD_STRA"] >= order].copy()
        keep["km"] = keep.geometry.apply(lambda g: GEOD.geometry_length(g) / 1000.0)
        keep = keep[keep["km"] > 1.0]
        keep["geometry"] = keep.geometry.simplify(0.001, preserve_topology=False)
        total_km = float(keep["km"].sum())
        feats = [f for f in feats if f["properties"]["o"] >= order]
        C.save_json(C.DATA / "rivers.geojson", {"type": "FeatureCollection", "features": feats})
        size_kb = (C.DATA / "rivers.geojson").stat().st_size / 1e3
        print(f"  now {len(feats)} features, {size_kb:.0f} kB")

    print("[3/4] water raster + riverKm per region")
    counts_cache = C.RAW / "worldcover_counts.npz"
    if not counts_cache.exists():
        raise SystemExit("run layers/forest_landuse.py first (it caches the WorldCover counts)")
    z = np.load(counts_cache)
    counts, covered = z["counts"], z["covered"]
    classes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]
    assert counts.shape[2] == len(classes), "stale WorldCover cache - rerun forest_landuse.py"
    i_water = classes.index(80)
    has_any = counts.sum(axis=2).astype("float64")
    water_pct = np.where(country & (has_any > 0),
                         counts[:, :, i_water] / np.maximum(has_any, 1) * 100, np.nan)
    water_pct = np.clip(water_pct, 0, 100)
    q = C.quantize(water_pct, 0, 100, "linear", valid=country)
    C.write_bin("rivers", q)
    print(f"  water cells: {(water_pct > 20).sum()}  mean {np.nanmean(water_pct):.1f}%")

    # exact district geometry (the cached ADM2 file) rather than bbox overlaps
    from build_base import DISTRICT_FIX

    adm2 = gpd.read_file(C.RAW / "bgd_adm2_simplified.geojson").to_crs(4326)
    adm2["name"] = adm2["shapeName"].replace(DISTRICT_FIX)
    geom_by_name = dict(zip(adm2["name"], adm2.geometry))

    doc = C.load_regions_doc()
    river_km = {}
    for v in doc:
        for d in v["districts"]:
            geom = geom_by_name.get(d["name"])
            if geom is None:
                print(f"  ! no geometry for {d['name']}")
                river_km[d["id"]] = 0.0
                continue
            idx = keep.sindex.query(geom, predicate="intersects")
            km = 0.0
            for g in keep.geometry.iloc[idx]:
                clipped = g.intersection(geom)
                if not clipped.is_empty and clipped.geom_type in ("LineString", "MultiLineString"):
                    km += GEOD.geometry_length(clipped) / 1000.0
            river_km[d["id"]] = round(km, 1)

    div_km = {}
    for v in doc:
        div_km[v["id"]] = round(sum(river_km[d["id"]] for d in v["districts"]), 1)

    def extra(_arr, region, _meta):
        # districts also carry a divisionId, so distinguish by the nested list
        if "districts" in region:
            return {"riverKm": div_km.get(region["id"], 0.0)}
        return {"riverKm": river_km.get(region["id"], 0.0)}

    C.attach_stats("rivers", water_pct, meta, extra_fn=extra)
    C.upsert_layer({
        "id": "rivers",
        "label": "Rivers & water",
        "unit": "% water cover",
        "type": "raster",
        "min": 0,
        "max": 100,
        "scale": "linear",
        "ramp": RAMP,
        "heightMode": "flat",
        "heightScale": 0.010,
        "sink": True,
        "source": "HydroRIVERS v10 (lines) + ESA WorldCover class 80 (water mask)",
        "sourceUrl": "https://www.hydrosheds.org/products/hydrorivers",
        "license": "HydroSHEDS license (attribution); WorldCover CC BY 4.0",
        "year": 2020,
    })

    print("[4/4] CHECKPOINT rivers")
    doc = C.load_regions_doc()
    widest = keep.nlargest(5, "DIS_AV_CMS")
    for _, row in widest.iterrows():
        p = row.geometry.interpolate(0.5, normalized=True)
        print(f"  {row['DIS_AV_CMS']:7.0f} m3/s  order {int(row['ORD_STRA'])}  "
              f"at {p.y:.2f}N {p.x:.2f}E")
    top_div = sorted(((v["stats"]["rivers"].get("riverKm") or 0, v["name"]) for v in doc), reverse=True)
    print("  river km by division:", [(n, round(km)) for km, n in top_div])
    print(f"  {len(feats)} features / {total_km:,.0f} km drawn")
    confluence = widest.geometry.iloc[0].interpolate(0.5, normalized=True)
    assert 88.5 < confluence.x < 91.5 and 21.5 < confluence.y < 25.0, "largest river outside the delta"
    assert top_div[0][0] > 200, "no division has a meaningful river network"
    assert all(km > 0 for km, _ in top_div), f"every division needs rivers: {top_div}"
    assert any(n in ("Barishal", "Khulna", "Dhaka") for _, n in top_div[:4]), "the delta should be dense"
    C.report_sizes()


if __name__ == "__main__":
    main()
