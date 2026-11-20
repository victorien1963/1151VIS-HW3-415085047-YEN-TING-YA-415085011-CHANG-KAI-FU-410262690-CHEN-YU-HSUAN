"""Rebuild the offline chart data from the published-data CSV."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CANDIDATES = {"沈伯洋": "泛綠", "蔣萬安": "泛藍"}


def build():
    camps = {camp: {"before": {}, "after": {}} for camp in CANDIDATES.values()}
    people = {name: {"name": name, "camp": camp} for name, camp in CANDIDATES.items()}
    with (ROOT / "tpoc_yangliu_20261006.csv").open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            kind, group, metric = row["dataset"], row["group"], row["metric"]
            if kind == "camp_comparison" and metric in ("posts", "buzz"):
                target = camps[group][row["period"]]
                key, value = metric, int(row["value"])
            elif kind == "candidate" and metric in ("buzz", "pn_ratio"):
                target = people[group]
                key = "buzz" if metric == "buzz" else "pn"
                value = int(row["value"]) if key == "buzz" else float(row["value"])
            else:
                continue
            if key in target or value < 0:
                raise ValueError(f"Duplicate or invalid data row: {row}")
            target[key] = value
    for periods in camps.values():
        for point in periods.values():
            if point.keys() != {"posts", "buzz"}:
                raise ValueError("Missing posts or buzz")
    for person in people.values():
        if not {"buzz", "pn"} <= person.keys():
            raise ValueError("Missing candidate data")
    data = {"camps": camps, "people": list(people.values())}
    content = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)
    (ROOT / "chart-data.js").write_text("window.YANGLIU_DATA = " + content + ";\n", encoding="utf-8")


if __name__ == "__main__":
    build()
