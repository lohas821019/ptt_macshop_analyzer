import sqlite3
import os
import time

DB_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DB_DIR, "macshop.db")

def get_connection():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=30000;")
    
    # Raw articles cache
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS raw_articles (
            article_id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            query_keyword TEXT,
            title TEXT,
            author TEXT,
            timestamp INTEGER,
            raw_html TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_timestamp ON raw_articles(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_keyword ON raw_articles(query_keyword)")

    # Parsed phone/tablet records
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parsed_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            device_type TEXT NOT NULL DEFAULT 'iphone',
            series TEXT NOT NULL,
            model TEXT NOT NULL,
            capacity TEXT NOT NULL,
            price INTEGER,
            status TEXT NOT NULL,
            sold_in_title INTEGER DEFAULT 0,
            sold_in_body INTEGER DEFAULT 0,
            location TEXT,
            battery INTEGER,
            date_str TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            raw_price_str TEXT,
            quality_score INTEGER,
            quality_flags TEXT,
            FOREIGN KEY(article_id) REFERENCES raw_articles(article_id)
        )
    """)
    # Migration: check if device_type and warranty columns exist
    cursor.execute("PRAGMA table_info(parsed_items)")
    cols = [row[1] for row in cursor.fetchall()]
    if "device_type" not in cols:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN device_type TEXT NOT NULL DEFAULT 'iphone'")
    if "warranty" not in cols:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN warranty TEXT DEFAULT '已過保'")
    if "quality_score" not in cols:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN quality_score INTEGER")
    if "quality_flags" not in cols:
        cursor.execute("ALTER TABLE parsed_items ADD COLUMN quality_flags TEXT")

    # Migration: check if is_parsed column exists in raw_articles
    cursor.execute("PRAGMA table_info(raw_articles)")
    raw_cols = [row[1] for row in cursor.fetchall()]
    if "is_parsed" not in raw_cols:
        cursor.execute("ALTER TABLE raw_articles ADD COLUMN is_parsed INTEGER DEFAULT 0")
        cursor.execute("UPDATE raw_articles SET is_parsed = 1")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_is_parsed ON raw_articles(is_parsed)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_device ON parsed_items(device_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_series ON parsed_items(series)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_model ON parsed_items(model)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_capacity ON parsed_items(capacity)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_status ON parsed_items(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_timestamp ON parsed_items(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parsed_date ON parsed_items(date_str)")

    conn.commit()
    conn.close()

def save_raw_article(article_id, url, query_keyword, title, author, timestamp, raw_html):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO raw_articles 
        (article_id, url, query_keyword, title, author, timestamp, raw_html, is_parsed)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    """, (article_id, url, query_keyword, title, author, timestamp, raw_html))
    conn.commit()
    conn.close()

def get_existing_article_ids():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT article_id FROM raw_articles")
    ids = {row[0] for row in cursor.fetchall()}
    conn.close()
    return ids

def clear_parsed_items():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM parsed_items")
    conn.commit()
    conn.close()

def get_unparsed_raw_articles():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM raw_articles WHERE is_parsed = 0 ORDER BY timestamp ASC")
    rows = cursor.fetchall()
    conn.close()
    return rows

def mark_articles_as_parsed(article_ids):
    if not article_ids:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executemany("UPDATE raw_articles SET is_parsed = 1 WHERE article_id = ?", [(aid,) for aid in article_ids])
    conn.commit()
    conn.close()

def reset_parsed_status():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE raw_articles SET is_parsed = 0")
    conn.commit()
    conn.close()

def save_parsed_items(items):
    if not items:
        return
    conn = get_connection()
    cursor = conn.cursor()
    # Remove existing parsed items for these articles to prevent duplicate entries
    article_ids = list({it['article_id'] for it in items})
    cursor.executemany("DELETE FROM parsed_items WHERE article_id = ?", [(aid,) for aid in article_ids])
    cursor.executemany("""
        INSERT INTO parsed_items 
        (article_id, device_type, series, model, capacity, price, status, sold_in_title, sold_in_body, 
         location, battery, warranty, date_str, timestamp, url, title, raw_price_str,
         quality_score, quality_flags)
        VALUES 
        (:article_id, :device_type, :series, :model, :capacity, :price, :status, :sold_in_title, :sold_in_body,
         :location, :battery, :warranty, :date_str, :timestamp, :url, :title, :raw_price_str,
         :quality_score, :quality_flags)
    """, items)
    conn.commit()
    conn.close()

def get_all_parsed_items():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parsed_items ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return rows

def get_stale_articles(max_age_days=30):
    """
    Returns raw_articles that:
    - Are within the past `max_age_days` days (by timestamp)
    - Have at least one parsed_item with status NOT '已售出'
    These are candidates for re-fetching to detect post-edit status changes
    (e.g., seller edits the body to add '已售出' after initial crawl).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cutoff_ts = int(time.time() - max_age_days * 86400)
    cursor.execute("""
        SELECT DISTINCT r.article_id, r.url, r.query_keyword,
                        r.title, r.author, r.timestamp
        FROM raw_articles r
        INNER JOIN parsed_items p ON r.article_id = p.article_id
        WHERE r.timestamp >= ?
          AND p.status != '已售出'
        ORDER BY r.timestamp DESC
    """, (cutoff_ts,))
    rows = cursor.fetchall()
    conn.close()
    return rows

def update_raw_html(article_id, raw_html):
    """
    Update the stored HTML of an existing article and reset is_parsed = 0
    so the analyzer will re-parse it on next run.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE raw_articles
        SET raw_html = ?, is_parsed = 0
        WHERE article_id = ?
    """, (raw_html, article_id))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized at", DB_PATH)
