"""把 taiwan-atlas 的 towns-10t.json 轉成台北市 12 區的 GeoJSON（輸出成網頁可直接載入的 JS）。"""
import json
import sys

src, out = sys.argv[1], sys.argv[2]
topo = json.load(open(src, encoding="utf-8"))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

arcs = []
for arc in topo["arcs"]:
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((round(x * sx + tx, 5), round(y * sy + ty, 5)))
    arcs.append(pts)


def ring(indices):
    pts = []
    for i in indices:
        a = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        if pts:
            a = a[1:]
        pts.extend(a)
    return [list(p) for p in pts]


features = []
for g in topo["objects"]["towns"]["geometries"]:
    p = g["properties"]
    if p.get("COUNTYENG") != "Taipei City":
        continue
    if g["type"] == "Polygon":
        coords = [ring(r) for r in g["arcs"]]
    elif g["type"] == "MultiPolygon":
        coords = [[ring(r) for r in poly] for poly in g["arcs"]]
    else:
        raise ValueError(g["type"])
    features.append({"type": "Feature",
                     "properties": {"name": p["TOWNNAME"], "eng": p["TOWNENG"], "code": p["TOWNCODE"]},
                     "geometry": {"type": g["type"], "coordinates": coords}})

assert len(features) == 12, len(features)
fc = {"type": "FeatureCollection", "features": features}
header = ("// 台北市 12 區界線。來源：內政部「鄉鎮市區界線(TWD97經緯度)」(https://data.gov.tw/dataset/7441)，\n"
          "// 經 taiwan-atlas@2021.9.20 (MIT) 的 towns-10t.json 簡化，再由 tools/topo_to_taipei.py 轉出。\n")
open(out, "w", encoding="utf-8").write(header + "window.TAIPEI_GEO = " + json.dumps(fc, ensure_ascii=False, separators=(",", ":")) + ";\n")
print([f["properties"]["name"] for f in features], sum(len(json.dumps(f)) for f in features))
