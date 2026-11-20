import csv
import json
import os
from datetime import date, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(BASE), "data")
os.makedirs(OUT, exist_ok=True)

ARTICLE_URL = "https://www.qsearch.cc/blog/2026/11/2026-taipei-mayoral-street-campaign-social-volume/"
SITE_URL = "https://www.qsearch.cc/events/2026-taipei-election/review.html"


def d(m, day):
    return date(2026, m, day).isoformat()


# ---------- 1. 掃街相關每日貼文數（從圖讀值，10/1–11/16） ----------
shen_digit = [214, 165, 153, 125, 70, 101, 173, 75, 210, 246, 1005, 879, 500, 325, 316, 170, 100, 595, 636, 246,
              169, 74, 47, 71, 446, 355, 281, 279, 265, 211, 459, 1051, 1042, 469, 250, 372, 334, 927, 672, 253,
              290, 307, 260, 680, 457, 1282, 1115]
chiang_digit = [45, 42, 33, 10, 7, 18, 34, 23, 51, 43, 37, 19, 36, 63, 109, 69, 107, 34, 21, 15, 77, 27, 8, 9, 16,
                13, 115, 309, 435, 495, 94, 300, 241, 436, 493, 473, 280, 704, 454, 403, 338, 270, 265, 258, 309,
                409, 469]
assert len(shen_digit) == len(chiang_digit) == 47

# 文中寫明的精確數字，覆蓋讀值
shen_exact = {d(10, 11): 1006, d(10, 18): 592, d(10, 31): 460, d(11, 1): 1052, d(11, 7): 928,
              d(11, 15): 1283, d(11, 16): 1113}
chiang_exact = {d(11, 6): 280, d(11, 7): 704}

shen_sessions = {d(10, 11): "中山×大同", d(10, 18): "松山×信義", d(10, 31): "中正×萬華",
                 d(11, 1): "大安×文山", d(11, 7): "內湖×南港", d(11, 15): "士林×北投"}
chiang_sessions = {d(10, 27): "內湖737夜市", d(10, 29): "夫人代打", d(11, 3): "寧夏夜市",
                   d(11, 6): "遼寧夜市（又一村）", d(11, 12): "公館", d(11, 13): "饒河夜市（東發號）",
                   d(11, 15): "臨江街夜市"}
annotations = {d(10, 28): "蔣萬安晚間身體不適", d(10, 29): "蔣萬安暫停公開行程，石舫亘代為走市場",
               d(10, 30): "蔣萬安暫停公開行程，石舫亘代為走市場", d(10, 31): "首場電視辯論（中午）",
               d(11, 6): "遼寧夜市「又一村」插曲", d(11, 14): "東發號是否付錢爭議"}

daily = []
for i in range(47):
    day = (date(2026, 10, 1) + timedelta(days=i)).isoformat()
    s_ex = day in shen_exact
    c_ex = day in chiang_exact
    daily.append({
        "date": day,
        "shen_street_posts": shen_exact.get(day, shen_digit[i]),
        "shen_is_exact": s_ex,
        "shen_campaign": shen_sessions.get(day, ""),
        "chiang_street_posts": chiang_exact.get(day, chiang_digit[i]),
        "chiang_is_exact": c_ex,
        "chiang_campaign": chiang_sessions.get(day, ""),
        "note": annotations.get(day, ""),
    })

# ---------- 2. 提到候選人的每日總聲量（專題網站內嵌資料，精確值） ----------
raw = json.load(open(os.path.join(BASE, "site_data_raw.json")))


def nums(s):
    return [None if x == "" else (float(x) if "." in x else int(x)) for x in s.split(",")]


s_all, c_all, bs, bc = nums(raw["shen"]), nums(raw["chiang"]), nums(raw["bS"]), nums(raw["bC"])
mentions = []
for i in range(len(s_all)):
    day = (date(2026, 8, 17) + timedelta(days=i)).isoformat()
    mentions.append({"date": day, "shen_mentions": s_all[i], "chiang_mentions": c_all[i],
                     "shen_site_b": bs[i], "chiang_site_b": bc[i]})

# ---------- 3. 沈伯洋 6 場車掃 ----------
# 圖二長條讀值：0 在第 766.7 列，每 2000 筆 73.4 px
def bar(top):
    return round((766.7 - top) * 2000 / 73.4)


bars = {d(10, 11): (505, 484), d(10, 18): (524, 517), d(10, 31): (443, 184),
        d(11, 1): (360, 361), d(11, 7): (428, 385), d(11, 15): (462, 378)}
ratio_label = {d(10, 11): 1.08, d(10, 18): 1.03, d(10, 31): 1.80, d(11, 1): 1.00, d(11, 7): 1.13, d(11, 15): 1.27}
sessions_info = [
    (d(10, 11), "日", "中山×大同", "首場；王世堅同車，終點大龍峒保安宮", "路邊舉牌、上千輛機車跟車、經過馬偕醫院關音樂", "首場、王世堅、貪食蛇"),
    (d(10, 18), "日", "松山×信義", "五分埔出發，終點民權公園；首次不跟車、認領路段；卓榮泰、蘇春槐到場", "回老家五分埔、民眾跟著車隊全程慢跑", ""),
    (d(10, 31), "六", "中正×萬華", "古亭南福宮出發，終點龍山寺；當天中午是首場電視辯論", "萬聖節穿動畫角色欣梅爾的衣服", ""),
    (d(11, 1), "日", "大安×文山", "木柵集應廟出發，終點大安森林公園；蔡其昌同車，蔡英文開講", "洋流設計師本人路邊發海報、包船應援的玩笑", ""),
    (d(11, 7), "六", "內湖×南港", "原訂 10/25，因颱風延期；李洋同車，蕭美琴到場", "「洋洋連線」、團隊事先向店家打招呼", "李洋、蕭美琴、運動部長"),
    (d(11, 15), "日", "士林×北投", "壓軸場；陳其邁同車，終點關渡宮；賴清德到場", "太太舉牌祝結婚紀念日、支持者划龍舟到關渡", "關渡、終場、陳其邁、賴清德"),
]
excluded = {d(10, 31): "當天中午是首場電視辯論，無法分辨是辯論還是車掃帶動",
            d(11, 1): "前 3 天包含辯論日，比較基準被拉高"}
by_date = {r["date"]: r for r in daily}


def shift(day, n):
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


shen_sessions_rows = []
for i, (day, wd, name, route, scene, kw) in enumerate(sessions_info):
    pre, today = bars[day]
    v0 = by_date[day]["shen_street_posts"]
    row = {
        "session_no": i + 1, "date": day, "weekday": wd, "districts": name,
        "route_and_companions": route, "memorable_scene": scene, "top_keywords": kw,
        "street_posts_day0": v0,
        "street_posts_day1": by_date.get(shift(day, 1), {}).get("shen_street_posts"),
        "street_posts_day2": by_date.get(shift(day, 2), {}).get("shen_street_posts"),
        "street_posts_day3": by_date.get(shift(day, 3), {}).get("shen_street_posts"),
        "mentions_4p_prev3_avg_est": bar(pre), "mentions_4p_day0_est": bar(today),
        "ratio_4p_label": ratio_label[day],
        "excluded_from_ratio": day in excluded, "exclude_reason": excluded.get(day, ""),
    }
    shen_sessions_rows.append(row)

# ---------- 4. 蔣萬安 7 場掃街 ----------
chiang_rows = []
for day, name in chiang_sessions.items():
    v0 = by_date[day]["chiang_street_posts"]
    v1 = by_date.get(shift(day, 1), {}).get("chiang_street_posts")
    chiang_rows.append({"date": day, "place": name, "street_posts_day0": v0, "street_posts_day1": v1,
                        "day1_over_day0": round(v1 / v0, 2) if v1 else None})

# ---------- 5. 熱門貼文 ----------
P = "https://www.threads.net/"
F = "https://www.facebook.com/"
shen_posts = [
    ("10/11 中山×大同", "沈伯洋", "候選人", "首場心得：看到民眾舉牌「台北須團結，團結真有力」，一度眼眶泛紅", "13.6 萬", P + "@pumashen/post/DeXAYd0kywx"),
    ("10/11 中山×大同", "張益贍", "評論者", "車隊後方跟著的機車超過 2,000 台（發文者自估）", "3.0 萬", P + "@yisan0519/post/DeWfreNj7g6"),
    ("10/11 中山×大同", "c妞", "一般民眾", "問朋友為什麼只有王世堅拿到烤香腸，朋友說那是船舵", "3.3 萬", P + "@cnewloveyou/post/DeWiVJtD73q"),
    ("10/18 松山×信義", "周立軒", "個人帳號", "一組「洋流路跑團」全程跟著車隊跑", "4.3 萬", P + "@victor31429/post/DeohzbRD7FL"),
    ("10/18 松山×信義", "打馬悍將粉絲團", "政治粉專", "松山信義車掃人潮影片", "4.5 萬", F + "reel/1866239834362758/"),
    ("10/18 松山×信義", "Jenny C.", "一般民眾", "車掃途中看到健身教練", "3.4 萬", P + "@jennychang211/post/Deoc7BHEmSI"),
    ("10/31 中正×萬華", "yhnmtttt", "一般民眾", "沈伯洋穿著動畫角色欣梅爾的衣服車掃", "4.8 萬", P + "@yhnmtttt/post/DfJ329Bkidx"),
    ("10/31 中正×萬華", "ngnews6969", "一般民眾", "邊倒垃圾邊看車掃直播，和鄰居的政治對話", "6.2 萬", P + "@ngnews6969/post/DfKM5uTk0WD"),
    ("10/31 中正×萬華", "連文烽", "一般民眾", "看完辯論，建議多辦車掃、跟市民互動", "1.6 萬", P + "@liengavin/post/DfJe1s8lNvT"),
    ("11/1 大安×文山", "蕭婆不姓蕭", "一般民眾", "在路邊碰到洋流設計師本人發海報", "3.9 萬", P + "@doritosaholic/post/DfNQjumCEFI"),
    ("11/1 大安×文山", "蔡其昌", "立委，陪同車掃", "「人潮太驚人，真的有累到」", "3.8 萬", P + "@tsaimimi0416/post/DfMq1h1GY15"),
    ("11/1 大安×文山", "謝小舞", "一般民眾", "車掃時「看見」神明護持沈伯洋", "5.5 萬", P + "@viola_hsieh1111/post/DfM8YyfkvVj"),
    ("11/7 內湖×南港", "northicewolf", "個人帳號", "團隊掃街前先跟店家打招呼", "7.7 萬", P + "@northicewolf/post/DfbpdycEwkN"),
    ("11/7 內湖×南港", "洪彥安", "個人帳號", "神秘嘉賓是李洋，「洋洋連線」", "5.2 萬", P + "@andyhung69/post/DfbyWW4mSGv"),
    ("11/7 內湖×南港", "邱宏杰", "一般民眾", "「車掃發現有洋蔥」", "5.2 萬", P + "@a0923352759/post/Dfb-LlhHxbk"),
    ("11/15 士林×北投", "林楚茵", "立委", "談終點的無人機秀", "7.0 萬", P + "@linchuyin1010/post/DfyKAQrABbk"),
    ("11/15 士林×北投", "吳沛憶", "立委", "批評國民黨立委質詢李洋參加車掃", "5.8 萬", P + "@pay1pay1/post/Dfy0SUnlqu-"),
    ("11/15 士林×北投", "Regina אושר Chang", "個人帳號", "沈伯洋看到太太舉牌，大喊「我老婆欸」", "8.6 萬", P + "@regina_rainywar/post/Dfwg5alnNuI"),
]
chiang_posts = [
    ("10/27", "戴騰展", "一般民眾", "貼出內湖 737 夜市掃街照片，並補上沈伯洋先前的掃街照片對照，標註「#戒慎恐懼」", "1.0 萬", P + "@tengzhandai/post/De_uPHQE3QC"),
    ("10/28", "Milo", "評論帳號", "轉述蔣萬安掃街後身體不適、取消行程，並調侃", "1.5 萬", P + "@chnyu._12/post/DfCnVSrGA0G"),
    ("10/29", "張老大頻道", "粉絲專頁", "蔣萬安身體微恙，夫人代為掃街拜票", "1.7 萬", F + "682006400605900/posts/1671442514995612"),
    ("10/30", "羅智強", "國民黨立委、蔣萬安競選總幹事", "「蔣萬安生病休息，石舫亘温暖掃街」", "4.3 萬", F + "reel/2927844564262786/"),
    ("11/4", "Matthew Yu", "一般民眾", "以「花了將近30秒才能通過，真穩！」形容南機場掃街人潮", "3.5 萬", P + "@yumatt6727/post/DfUhop5AaWn"),
    ("11/4", "中時新聞網", "媒體", "寧夏夜市掃街時，同志支持者到場力挺", "2.8 萬", F + "reel/1499840188872529/"),
    ("11/7", "Milo", "評論帳號", "批評支持者在遼寧夜市圍住挺沈伯洋的店家喊口號", "3.4 萬", P + "@chnyu._12/post/DfaJzFrGHJz"),
    ("11/7", "羅智強", "國民黨立委、蔣萬安競選總幹事", "反駁「霸凌店家」說法，反指沈伯洋過去發動罷免", "1.7 萬", F + "461480528667073/posts/1764590161689430"),
    ("11/12", "中天新聞", "媒體", "公館商圈夜市掃街直播", "—", F + "579015031019914/videos/1084220927997035"),
    ("11/13", "Zen大的時事點評", "評論粉專", "談蔣萬安到公館夜市掃街，以及蔥抓餅老闆娘挺沈伯洋", "5,880", F + "492748909530301/posts/1657039449767902"),
    ("11/14", "黃益中", "評論者", "轉述許淑華指蔣萬安團隊在東發號用餐未付錢", "1.3 萬", P + "@yizhong0217/post/Dftw86CkqAS"),
    ("11/14", "中時新聞網", "媒體", "蔣萬安表示堅持付款但店家不收，請自治會長轉交", "7,535", F + "679047304031343/posts/1639853764617354"),
    ("11/15", "羅智強", "國民黨立委、蔣萬安競選總幹事", "引夜市自治會說法反駁「沒付錢」，要求許淑華道歉", "2.7 萬", F + "461480528667073/posts/1773276110820835"),
    ("11/15", "羅浚晅", "個人帳號", "批評蔣萬安與館長等人一起掃街", "3.1 萬", P + "@dr.brain_/post/Dfw9sgXieR9"),
]
SMALL = {"yhnmtttt", "邱宏杰", "蕭婆不姓蕭", "謝小舞", "ngnews6969"}


def category(label):
    if label in ("候選人",) or "立委" in label:
        return "政治人物"
    if label in ("評論者", "評論帳號", "評論粉專"):
        return "評論者"
    if label in ("政治粉專", "粉絲專頁"):
        return "粉專"
    return label  # 一般民眾 / 個人帳號 / 媒體


def interactions(label):
    if label == "—":
        return None
    if "萬" in label:
        return round(float(label.replace("萬", "").strip()) * 10000)
    return int(label.replace(",", ""))


def md_to_iso(md):
    m, dd = md.split("/")
    return d(int(m), int(dd))


posts = []
for (sess, author, label, content, inter, url) in shen_posts:
    md, place = sess.split(" ")
    posts.append({"candidate": "shen", "date": md_to_iso(md), "date_meaning": "車掃場次日", "session": place,
                  "author": author, "author_label": label, "author_category": category(label),
                  "followers_under_600": author in SMALL, "content": content,
                  "interactions": interactions(inter), "interactions_label": inter,
                  "platform": "threads" if "threads" in url else "facebook", "url": url, "in_article_table": True})
for (md, author, label, content, inter, url) in chiang_posts:
    posts.append({"candidate": "chiang", "date": md_to_iso(md), "date_meaning": "發文日", "session": "",
                  "author": author, "author_label": label, "author_category": category(label),
                  "followers_under_600": False, "content": content,
                  "interactions": interactions(inter), "interactions_label": inter,
                  "platform": "threads" if "threads" in url else "facebook", "url": url, "in_article_table": True})
# 內文提到但不在表格裡的兩篇
posts.append({"candidate": "shen", "date": d(10, 31), "date_meaning": "發文日", "session": "中正×萬華",
              "author": "沈伯洋", "author_label": "候選人", "author_category": "政治人物", "followers_under_600": False,
              "content": "辯論日長文，車掃只在其中一句（文中說明未列入表格）", "interactions": 163000,
              "interactions_label": "約 16.3 萬", "platform": "threads",
              "url": P + "@pumashen/post/DfJdux8lI1C", "in_article_table": False})
posts.append({"candidate": "shen", "date": d(11, 15), "date_meaning": "發文日", "session": "士林×北投",
              "author": "Yi-Ju Chen", "author_label": "", "author_category": "", "followers_under_600": False,
              "content": "轉述長輩看到洋流車掃人多，擔心蔣萬安選不上，決定坐輪椅也要去投票", "interactions": 39000,
              "interactions_label": "約 3.9 萬", "platform": "threads",
              "url": P + "@yijuchen213/post/DfwnMeMk6IL", "in_article_table": False})

assert sum(p["author_category"] == "一般民眾" for p in posts if p["candidate"] == "shen" and p["in_article_table"]) == 8
assert sum(p["author_category"] == "個人帳號" for p in posts if p["candidate"] == "shen" and p["in_article_table"]) == 4
assert sum(p["author_category"] == "政治人物" for p in posts if p["candidate"] == "shen" and p["in_article_table"]) == 4
assert sum(p["author_category"] == "一般民眾" for p in posts if p["candidate"] == "chiang") == 2

# ---------- 寫檔 ----------
def write_csv(name, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


write_csv("street_campaign_daily.csv", daily)
write_csv("candidate_mentions_daily.csv", mentions)
write_csv("shen_campaign_sessions.csv", shen_sessions_rows)
write_csv("chiang_campaign_sessions.csv", chiang_rows)
write_csv("top_posts.csv", posts)

meta = {
    "source_article": ARTICLE_URL,
    "source_site_data": SITE_URL,
    "extracted_on": "2026-11-20",
    "period": "2026-10-01 ~ 2026-11-16",
    "totals_from_article": {
        "shen_mentions": "約 38.9 萬筆，其中掃街相關約 1.9 萬筆",
        "chiang_mentions": "約 27.4 萬筆，其中掃街相關約 8,500 筆",
        "note": "兩人的查詢會重疊，數字不宜相加或比較",
    },
    "other_facts_from_article": {
        "threads_day0_ratio_range": "車掃當天 Threads 是前 3 天的 1.35～1.51 倍（各場數字未公開）",
        "no_campaign_weekend_median_ratio": 0.99,
        "youtube_videos_10_18_to_10_19": [185, 255],
        "decay_ranges": {"day1": "72%～108%（5 場）", "day2": "27%～50%（前 4 場）", "day3": "24%～32%（前 4 場）"},
    },
    "files": {
        "street_campaign_daily": "掃街相關的每日貼文數。四平台（Threads、Facebook、新聞、YouTube 影片數）。is_exact=true 是文中寫明的數字，其餘是從圖片讀出來的估計值，誤差約 ±5 筆。沈伯洋已排除談蔣萬安掃街的貼文，蔣萬安已排除只談沈伯洋車掃的貼文。",
        "candidate_mentions_daily": "提到候選人的每日總聲量（精確值），來自「台北市長選戰總複習」網站頁面內嵌資料。只有 Threads、Facebook、新聞三平台，不含 YouTube，所以會比文章圖二的四平台數字少（大約少 650～850 筆）。site_b 是網站自己的欄位，網站沒說明意義，數值看起來像移動中位數基準線；8/17–8/20 沒有值。",
        "shen_campaign_sessions": "沈伯洋 6 場車掃。mentions_4p_* 是從圖二長條讀出的四平台「提到沈伯洋」筆數，誤差約 ±30 筆；ratio_4p_label 是圖上標的倍數（精確）。day1～day3 是掃街相關貼文的隔天、後天、3 天後。",
        "chiang_campaign_sessions": "蔣萬安 7 場掃街，日期取自圖四的直線位置；數字是掃街相關貼文（讀值，11/6、11/7 為文中精確值）。",
        "top_posts": "兩張熱門貼文表格（沈 18 筆、蔣 14 筆）加上內文提到的 2 篇（in_article_table=false）。互動數是 11/17 文章作者查看時的數字，「萬」為四捨五入後的值。沈伯洋的 date 是車掃場次日，蔣萬安的 date 是發文日。author_category 是我把原文的發文者標註歸成六類：一般民眾、個人帳號、政治人物、評論者、粉專、媒體。",
    },
}
data = {"meta": meta, "street_campaign_daily": daily, "candidate_mentions_daily": mentions,
        "shen_campaign_sessions": shen_sessions_rows, "chiang_campaign_sessions": chiang_rows, "top_posts": posts}
with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(OUT)
for r in shen_sessions_rows:
    print(r["date"], r["street_posts_day0"], r["street_posts_day1"], r["street_posts_day2"], r["street_posts_day3"],
          r["mentions_4p_prev3_avg_est"], r["mentions_4p_day0_est"],
          round(r["mentions_4p_day0_est"] / r["mentions_4p_prev3_avg_est"], 3), r["ratio_4p_label"])
for r in chiang_rows:
    print(r)
