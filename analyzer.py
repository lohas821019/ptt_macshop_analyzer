import json
import os
import datetime
import numpy as np
import database
import parser

JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "iphone_data.json")

def calculate_stats(prices):
    if not prices:
        return {
            "count": 0,
            "min": 0,
            "max": 0,
            "avg": 0,
            "median": 0,
            "mode": 0,
            "lowest10_avg": 0,
            "p25": 0,
            "p75": 0
        }
    arr = np.array(prices)
    median_val = int(round(np.median(arr)))
    
    # Mode calculation
    from collections import Counter
    c = Counter(prices)
    max_freq = max(c.values()) if c else 0
    modes = [val for val, cnt in c.items() if cnt == max_freq]
    if len(modes) == 1:
        mode_val = modes[0]
    elif max_freq > 1:
        mode_val = int(round(sum(modes) / len(modes) / 100) * 100)
    else:
        mode_val = median_val

    # Lowest 10 average
    sorted_p = sorted(prices)
    lowest10 = sorted_p[:min(10, len(sorted_p))]
    lowest10_avg = int(round(sum(lowest10) / len(lowest10))) if lowest10 else 0

    return {
        "count": len(prices),
        "min": int(np.min(arr)),
        "max": int(np.max(arr)),
        "avg": int(round(np.mean(arr))),
        "median": median_val,
        "mode": mode_val,
        "lowest10_avg": lowest10_avg,
        "p25": int(round(np.percentile(arr, 25))),
        "p75": int(round(np.percentile(arr, 75)))
    }

def analyze_category_data(items, series_order, capacity_order):
    items_with_price = [it for it in items if it['price'] is not None and it['price'] >= 3000]
    sold_items = [it for it in items_with_price if it['status'] == '已售出']
    reserved_items = [it for it in items_with_price if it['status'] == '暫售']
    pending_items = [it for it in items_with_price if it['status'] == '洽中']
    active_items = [it for it in items_with_price if it['status'] == '販售中']

    earliest_date = min((it['date_str'] for it in items), default="")
    latest_date = max((it['date_str'] for it in items), default="")

    summary = {
        "total_items": len(items),
        "items_with_price": len(items_with_price),
        "sold_count": len(sold_items),
        "reserved_count": len(reserved_items),
        "pending_count": len(pending_items),
        "active_count": len(active_items),
        "sold_ratio": round((len(sold_items) / len(items_with_price) * 100), 1) if items_with_price else 0,
        "earliest_date": earliest_date,
        "latest_date": latest_date,
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # Group by (Model, Capacity)
    model_cap_groups = {}
    for it in items_with_price:
        key = (it['series'], it['model'], it['capacity'])
        if key not in model_cap_groups:
            model_cap_groups[key] = {
                "sold_prices": [],
                "active_prices": [],
                "all_prices": [],
                "items": []
            }
        model_cap_groups[key]["all_prices"].append(it['price'])
        if it['status'] == '已售出':
            model_cap_groups[key]["sold_prices"].append(it['price'])
        elif it['status'] == '販售中':
            model_cap_groups[key]["active_prices"].append(it['price'])
        model_cap_groups[key]["items"].append(it)

    grouped_stats = []
    for (ser, mod, cap), data in model_cap_groups.items():
        sold_stat = calculate_stats(data["sold_prices"])
        active_stat = calculate_stats(data["active_prices"])
        total_stat = calculate_stats(data["all_prices"])
        sold_pct = round(sold_stat["count"] / total_stat["count"] * 100, 1) if total_stat["count"] > 0 else 0

        latest_sold = None
        latest_active = None
        for it in data["items"]:
            if it['status'] == '已售出':
                if not latest_sold or it['date_str'] > latest_sold['date'] or (it['date_str'] == latest_sold['date'] and it['article_id'] > latest_sold.get('id', '')):
                    latest_sold = {"price": it['price'], "date": it['date_str'], "id": it['article_id']}
            elif it['status'] == '販售中':
                if not latest_active or it['date_str'] > latest_active['date'] or (it['date_str'] == latest_active['date'] and it['article_id'] > latest_active.get('id', '')):
                    latest_active = {"price": it['price'], "date": it['date_str'], "id": it['article_id']}

        price_diff = None
        if latest_active and latest_sold:
            price_diff = latest_active["price"] - latest_sold["price"]
        elif active_stat["median"] > 0 and sold_stat["median"] > 0:
            price_diff = active_stat["median"] - sold_stat["median"]

        grouped_stats.append({
            "series": ser,
            "model": mod,
            "capacity": cap,
            "total_count": total_stat["count"],
            "sold_count": sold_stat["count"],
            "sold_ratio": sold_pct,
            "sold_stats": sold_stat,
            "active_stats": active_stat,
            "total_stats": total_stat,
            "latest_sold": latest_sold,
            "latest_active": latest_active,
            "price_diff": price_diff
        })

    def sort_key(x):
        s_idx = series_order.index(x['series']) if x['series'] in series_order else 99
        c_idx = capacity_order.index(x['capacity']) if x['capacity'] in capacity_order else 99
        return (s_idx, x['model'], c_idx)
    grouped_stats.sort(key=sort_key)

    # Monthly trends
    monthly_data = {}
    for it in sold_items:
        month = it['date_str'][:7]
        ser = it['series']
        if month not in monthly_data:
            monthly_data[month] = {s: [] for s in series_order}
        if ser in monthly_data[month]:
            monthly_data[month][ser].append(it['price'])

    # Continuous 24-month calendar timeline (2024-09 ~ 2026-09)
    start_y, start_m = 2024, 9
    end_y, end_m = 2026, 9
    continuous_months = []
    cy, cm = start_y, start_m
    while (cy < end_y) or (cy == end_y and cm <= end_m):
        continuous_months.append(f"{cy:04d}-{cm:02d}")
        cm += 1
        if cm > 12:
            cm = 1
            cy += 1

    monthly_trends = {
        "months": continuous_months,
        "series": {}
    }
    for ser in series_order:
        series_prices = []
        for m in continuous_months:
            plist = monthly_data.get(m, {}).get(ser, [])
            avg_p = int(round(np.mean(plist))) if plist else None
            series_prices.append(avg_p)
        monthly_trends["series"][ser] = series_prices

    return {
        "summary": summary,
        "grouped_stats": grouped_stats,
        "monthly_trends": monthly_trends
    }

def analyze(force_reparse=False):
    database.init_db()

    if force_reparse:
        print("[*] Force re-parse requested. Clearing parsed items and resetting parse flags...")
        database.clear_parsed_items()
        database.reset_parsed_status()

    # Check for unparsed raw articles
    unparsed_rows = database.get_unparsed_raw_articles()
    if unparsed_rows:
        print(f"[*] Incrementally parsing {len(unparsed_rows)} new raw articles...")
        new_items = []
        parsed_article_ids = []
        for r in unparsed_rows:
            items = parser.parse_article_html(
                article_id=r['article_id'],
                url=r['url'],
                title=r['title'],
                author=r['author'],
                timestamp=r['timestamp'],
                raw_html=r['raw_html']
            )
            new_items.extend(items)
            parsed_article_ids.append(r['article_id'])

        if new_items:
            database.save_parsed_items(new_items)
            print(f"[OK] Parsed and saved {len(new_items)} new valid items.")
        database.mark_articles_as_parsed(parsed_article_ids)
    else:
        print("[*] All raw articles already parsed in local database. Loading cached records...")

    # Load all parsed items directly from database (sub-second fast load)
    all_rows = database.get_all_parsed_items()
    all_items = [dict(r) for r in all_rows]
    print(f"[*] Total valid parsed items in database: {len(all_items)}")

    # Total articles count from raw_articles for summary
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM raw_articles WHERE title LIKE '%iphone%' OR title LIKE '%販售%'")
    iphone_total_articles = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM raw_articles WHERE title LIKE '%ipad%'")
    ipad_total_articles = c.fetchone()[0]
    conn.close()

    # Separate items by device_type
    iphone_items = [it for it in all_items if it['device_type'] == 'iphone']
    ipad_items = [it for it in all_items if it['device_type'] == 'ipad_mini']

    # Analyze iPhone
    iphone_series_order = ["iPhone 18", "iPhone 17", "iPhone 16", "iPhone 15", "iPhone 14", "iPhone 13"]
    iphone_capacity_order = ["128G", "256G", "512G", "1TB", "2TB", "64G"]
    iphone_data = analyze_category_data(iphone_items, iphone_series_order, iphone_capacity_order)
    iphone_data["summary"]["total_articles"] = iphone_total_articles

    # Analyze iPad mini
    ipad_series_order = ["iPad mini 7", "iPad mini 6"]
    ipad_capacity_order = ["64G", "128G", "256G", "512G"]
    ipad_data = analyze_category_data(ipad_items, ipad_series_order, ipad_capacity_order)
    ipad_data["summary"]["total_articles"] = ipad_total_articles

    # Table items
    table_items = []
    for it in all_items:
        table_items.append({
            "id": it['article_id'],
            "device_type": it['device_type'],
            "series": it['series'],
            "model": it['model'],
            "capacity": it['capacity'],
            "price": it['price'],
            "status": it['status'],
            "location": it['location'],
            "battery": it['battery'],
            "warranty": it['warranty'] if ('warranty' in it.keys() and it['warranty']) else "已過保",
            "date": it['date_str'],
            "title": it['title'],
            "url": it['url'],
            "raw_price": it['raw_price_str']
        })

    output_data = {
        "categories": {
            "iphone": iphone_data,
            "ipad_mini": ipad_data
        },
        # Top-level fallback for iphone
        "summary": iphone_data["summary"],
        "grouped_stats": iphone_data["grouped_stats"],
        "monthly_trends": iphone_data["monthly_trends"],
        "items": table_items
    }

    os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    js_content = f"window.IPHONE_DATA = {json.dumps(output_data, ensure_ascii=False)};"
    js_path1 = os.path.join(os.path.dirname(__file__), "data", "iphone_data.js")
    js_path2 = os.path.join(os.path.dirname(__file__), "web", "iphone_data.js")
    with open(js_path1, "w", encoding="utf-8") as f:
        f.write(js_content)
    with open(js_path2, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"[OK] Analysis complete! Data exported to: {JSON_PATH} and web/iphone_data.js")
    return output_data

if __name__ == "__main__":
    import sys
    force = "--reparse" in sys.argv
    analyze(force_reparse=force)
