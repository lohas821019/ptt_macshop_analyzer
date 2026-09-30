import time
import crawler
import analyzer

def run_backfill():
    start_time = time.time()
    targets = ["iPhone 16", "iPhone 15", "iPhone 14", "iPhone 13"]
    print("================================================================")
    print("[*] Starting 2-Year Full Historical Backfill for:")
    print(f"    {', '.join(targets)}")
    print("================================================================")
    
    total_new = 0
    for query in targets:
        count = crawler.crawl_series(query, years=2.0, max_pages=None, max_workers=8, full_scan=True)
        total_new += count
        time.sleep(1)

    print("\n================================================================")
    print(f"[*] Crawling finished in {time.time() - start_time:.1f}s.")
    print("[*] Running full statistical analysis & generating web data...")
    print("================================================================")
    analyzer.analyze(force_reparse=True)
    print("\n[OK] 2-Year historical data backfill complete!")

if __name__ == "__main__":
    run_backfill()
