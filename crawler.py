import requests
import bs4
import re
import time
import datetime
import concurrent.futures
import threading
from urllib.parse import quote
import database

BASE_URL = "https://www.ptt.cc"
SEARCH_URL = "https://www.ptt.cc/bbs/MacShop/search"

SERIES_QUERIES = [
    "iPhone 18",
    "iPhone 17",
    "iPhone 16",
    "iPhone 15",
    "iPhone 14",
    "iPhone 13",
    "iPad mini 7",
    "iPad mini 6",
]

def create_session():
    session = requests.Session()
    session.cookies.set('over18', '1')
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    })
    return session

def fetch_search_page(session, query, page=1):
    url = f"{SEARCH_URL}?page={page}&q={quote(query)}"
    try:
        r = session.get(url, timeout=10)
        if r.status_code == 200:
            return r.text
    except Exception as e:
        print(f"Error fetching search page {url}: {e}")
    return None

def extract_search_entries(html):
    soup = bs4.BeautifulSoup(html, 'lxml')
    entries = []
    for rent in soup.select('.r-ent'):
        title_tag = rent.select_one('.title a')
        if not title_tag:
            continue
        title = title_tag.text.strip()
        href = title_tag.get('href', '')
        author_tag = rent.select_one('.meta .author')
        author = author_tag.text.strip() if author_tag else ""
        
        # Check URL pattern M.<timestamp>.A.<hash>.html
        m = re.search(r'M\.(\d+)\.A\.([0-9A-Fa-f]+)', href)
        if not m:
            continue
        ts = int(m.group(1))
        article_id = f"M.{m.group(1)}.A.{m.group(2)}"
        full_url = f"{BASE_URL}{href}"
        
        entries.append({
            "article_id": article_id,
            "url": full_url,
            "title": title,
            "author": author,
            "timestamp": ts,
        })
    return entries

def fetch_article_html(session, url):
    for attempt in range(3):
        try:
            r = session.get(url, timeout=10)
            if r.status_code == 200:
                return r.text
            elif r.status_code == 404:
                return ""  # Cached deleted/not-found article
            time.sleep(0.5)
        except Exception:
            time.sleep(1)
    return None

def crawl_series(query, years=2, max_pages=None, max_workers=5, full_scan=False):
    """
    Crawls articles for a given series query going back up to `years` years.
    If full_scan is False (default), stops early when encountering already-cached articles.
    """
    database.init_db()
    existing_ids = database.get_existing_article_ids()
    cutoff_ts = int(time.time() - years * 365.25 * 86400)
    cutoff_date = datetime.datetime.fromtimestamp(cutoff_ts).strftime("%Y-%m-%d")
    mode_str = "Full History Scan" if full_scan else "Incremental Scan (Early Stopping)"
    
    print(f"\n==========================================")
    print(f"[*] Starting crawl for [{query}] ({mode_str})")
    print(f"[*] Cutoff Date: {cutoff_date} (Timestamp: {cutoff_ts})")
    print(f"==========================================")

    session = create_session()
    page = 1
    total_found = 0
    to_fetch = []
    reached_cutoff = False
    consecutive_existing = 0

    while True:
        if max_pages and page > max_pages:
            print(f"  Reached max page limit: {max_pages}")
            break

        html = fetch_search_page(session, query, page)
        if not html:
            break
            
        entries = extract_search_entries(html)
        if not entries:
            print(f"  Page {page}: No more entries.")
            break

        sales_entries = [e for e in entries if re.search(r'\[\s*販售.*?\]|【\s*販售.*?】', e['title'])]
        oldest_on_page = min(e['timestamp'] for e in entries) if entries else cutoff_ts
        oldest_dt = datetime.datetime.fromtimestamp(oldest_on_page).strftime("%Y-%m-%d")

        new_on_page = 0
        for entry in sales_entries:
            if entry['timestamp'] < cutoff_ts:
                reached_cutoff = True
                continue
            total_found += 1
            if entry['article_id'] not in existing_ids:
                to_fetch.append(entry)
                new_on_page += 1
                consecutive_existing = 0
            else:
                consecutive_existing += 1

        print(f"  Page {page:2d}: Found {len(entries)} items ({len(sales_entries)} sales, {new_on_page} new). Oldest: {oldest_dt}")

        if reached_cutoff:
            print(f"  --> Reached cutoff date {cutoff_date} at page {page}!")
            break

        # Early stopping for incremental updates:
        # If all sales articles on this page already exist, or we hit >= 15 consecutive existing articles
        if not full_scan:
            if len(sales_entries) > 0 and new_on_page == 0:
                print(f"  --> All sales articles on page {page} already cached in database. Stopping early.")
                break
            if consecutive_existing >= 15:
                print(f"  --> Reached {consecutive_existing} consecutive cached articles. Stopping early.")
                break

        page += 1
        time.sleep(0.2)

    print(f"[*] [{query}] Search index completed: {total_found} articles checked.")
    print(f"[*] Newly found articles needing download: {len(to_fetch)}")

    if not to_fetch:
        print(f"[*] All articles for [{query}] already cached in local database.")
        return total_found

    # Concurrent fetch with thread-local sessions for persistent connections
    print(f"[*] Downloading {len(to_fetch)} articles with {max_workers} threads (persistent HTTP keep-alive)...")
    completed = 0
    _thread_local = threading.local()

    def get_session():
        if not hasattr(_thread_local, "session"):
            _thread_local.session = create_session()
        return _thread_local.session

    def worker(entry):
        s = get_session()
        raw_html = fetch_article_html(s, entry['url'])
        if raw_html is not None:
            database.save_raw_article(
                article_id=entry['article_id'],
                url=entry['url'],
                query_keyword=query,
                title=entry['title'],
                author=entry['author'],
                timestamp=entry['timestamp'],
                raw_html=raw_html
            )
            return True
        return False

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(worker, entry): entry for entry in to_fetch}
        for f in concurrent.futures.as_completed(futures):
            completed += 1
            if completed % 25 == 0 or completed == len(to_fetch):
                print(f"    Progress: {completed}/{len(to_fetch)} articles downloaded ({completed/len(to_fetch)*100:.1f}%)")

    print(f"[OK] [{query}] Finished fetching.")
    return total_found

def crawl_all(years=2, max_pages=None, max_workers=5, full_scan=False):
    start_time = time.time()
    database.init_db()
    total = 0
    for query in SERIES_QUERIES:
        count = crawl_series(query, years=years, max_pages=max_pages, max_workers=max_workers, full_scan=full_scan)
        total += count
    elapsed = time.time() - start_time
    print(f"\n==========================================")
    print(f"[OK] All series crawl finished in {elapsed:.1f} seconds! Total articles scanned: {total}")
    print(f"==========================================")

if __name__ == "__main__":
    import sys
    years = 2
    full = "--full" in sys.argv
    crawl_all(years=years, full_scan=full)
