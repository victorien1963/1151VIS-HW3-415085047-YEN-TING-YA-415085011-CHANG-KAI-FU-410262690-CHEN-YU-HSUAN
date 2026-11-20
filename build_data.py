"""把 data/ 的 CSV 轉成網頁離線使用的 chart-data.js。"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def read(name):
    with (DATA / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def to_int(value):
    return None if value in ("", "None") else int(float(value))


def to_float(value):
    return None if value in ("", "None") else float(value)


def to_bool(value):
    if value not in ("True", "False"):
        raise ValueError(f"Expected True/False, got {value!r}")
    return value == "True"


def build():
    daily = [{
        "date": r["date"],
        "shen": to_int(r["shen_street_posts"]),
        "shenExact": to_bool(r["shen_is_exact"]),
        "shenCampaign": r["shen_campaign"],
        "chiang": to_int(r["chiang_street_posts"]),
        "chiangExact": to_bool(r["chiang_is_exact"]),
        "chiangCampaign": r["chiang_campaign"],
        "note": r["note"],
    } for r in read("street_campaign_daily.csv")]

    shen_sessions = [{
        "date": r["date"],
        "weekday": r["weekday"],
        "name": r["districts"],
        "route": r["route_and_companions"],
        "scene": r["memorable_scene"],
        "keywords": r["top_keywords"],
        "prev3": to_int(r["mentions_4p_prev3_avg_est"]),
        "day0": to_int(r["mentions_4p_day0_est"]),
        "ratio": to_float(r["ratio_4p_label"]),
        "excluded": to_bool(r["excluded_from_ratio"]),
        "excludeReason": r["exclude_reason"],
    } for r in read("shen_campaign_sessions.csv")]

    chiang_sessions = [{"date": r["date"], "name": r["place"]} for r in read("chiang_campaign_sessions.csv")]

    posts = [{
        "candidate": r["candidate"],
        "date": r["date"],
        "session": r["session"],
        "author": r["author"],
        "label": r["author_label"],
        "category": r["author_category"],
        "small": to_bool(r["followers_under_600"]),
        "content": r["content"],
        "interactions": to_int(r["interactions"]),
        "interactionsLabel": r["interactions_label"],
        "platform": r["platform"],
        "url": r["url"],
    } for r in read("top_posts.csv") if to_bool(r["in_article_table"])]

    dates = {d["date"] for d in daily}
    for s in shen_sessions + chiang_sessions:
        if s["date"] not in dates:
            raise ValueError(f"Session date outside daily data: {s['date']}")
    for d in daily:
        if d["shen"] is None or d["chiang"] is None or d["shen"] < 0 or d["chiang"] < 0:
            raise ValueError(f"Missing or negative daily value: {d}")

    data = {"daily": daily, "shenSessions": shen_sessions, "chiangSessions": chiang_sessions, "posts": posts}
    content = json.dumps(data, ensure_ascii=False, indent=1, allow_nan=False)
    (ROOT / "chart-data.js").write_text("window.STREET_DATA = " + content + ";\n", encoding="utf-8")


if __name__ == "__main__":
    build()
