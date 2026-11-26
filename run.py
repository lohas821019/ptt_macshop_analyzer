import argparse
import sys
import os
import webbrowser
import http.server
import socketserver
import threading
import time
import urllib.parse
import json

# Ensure UTF-8 console output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import crawler
import analyzer

_update_lock = threading.Lock()
_is_updating = False

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress routine GET request logs
        pass

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ('/api/update', '/api/crawl-recent'):
            self.handle_api_update(parsed)
        else:
            self.send_error(404, "Not Found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ('/api/update', '/api/crawl-recent'):
            self.handle_api_update(parsed)
        else:
            super().do_GET()

    def handle_api_update(self, parsed):
        global _is_updating
        params = urllib.parse.parse_qs(parsed.query)
        try:
            days = float(params.get('days', ['3'])[0])
        except (ValueError, IndexError):
            days = 3.0

        if not _update_lock.acquire(blocking=False):
            self.send_response(409)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": "系統正在爬取更新中，請稍候..."
            }, ensure_ascii=False).encode('utf-8'))
            return

        _is_updating = True
        try:
            print(f"\n============================================================")
            print(f"[*] [API] 收到網頁端更新請求：抓取近 {days:g} 天資料...")
            print(f"============================================================")
            crawler.crawl_all(days=days, max_workers=5, full_scan=False)
            crawler.refresh_stale_statuses(max_age_days=max(int(days), 1), max_workers=5)
            analyzer.analyze(force_reparse=False)
            print(f"[OK] [API] 近 {days:g} 天資料更新與分析完成！\n")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "message": f"成功更新近 {days:g} 天最新貼文與成交資料！",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            print(f"[!] [API] 更新過程發生異常: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": f"更新失敗: {str(e)}"
            }, ensure_ascii=False).encode('utf-8'))
        finally:
            _is_updating = False
            _update_lock.release()

def start_server(port=8000):
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)
    
    handler = QuietHTTPHandler
    # Allow port reuse
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"\n[OK] Web Dashboard running at: http://localhost:{port}/web/")
        print(f"[*] Press Ctrl+C in terminal to stop server.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[*] Server stopped.")

def main():
    parser = argparse.ArgumentParser(description="PTT MacShop iPhone 13~18 Series Analyzer & Dashboard")
    parser.add_argument("--years", type=float, default=2.0, help="Years of history to crawl (default: 2.0)")
    parser.add_argument("--days", type=float, default=None, help="Days of history to crawl (overrides --years if set)")
    parser.add_argument("--max-pages", type=int, default=None, help="Max search pages per series (default: unlimited until cutoff)")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent crawl workers (default: 6)")
    parser.add_argument("--full", action="store_true", help="Force full 2-year history crawl instead of incremental update")
    parser.add_argument("--reparse", action="store_true", help="Force re-parsing all raw articles in database")
    parser.add_argument("--skip-crawl", action="store_true", help="Skip crawling, analyze local DB and serve")
    parser.add_argument("--ipad-pro-only", action="store_true", help="Crawl iPad Pro only, then update analysis and serve")
    parser.add_argument("--ipad-mini-only", action="store_true", help="Crawl iPad mini only, then update analysis and serve")
    parser.add_argument("--serve-only", action="store_true", help="Only launch local web dashboard")
    parser.add_argument("--port", type=int, default=8000, help="Local server port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--refresh-days", type=int, default=30,
        help="Re-fetch non-sold articles posted within this many days to detect post-edit status changes (default: 30)")
    parser.add_argument("--skip-refresh", action="store_true",
        help="Skip the stale status refresh step")

    args = parser.parse_args()

    if not args.serve_only and not args.skip_crawl:
        mode_str = "Full History Scan" if args.full else "Incremental Scan"
        time_str = f"Past {args.days:g} days" if args.days else f"Past {args.years} years"
        if args.ipad_pro_only:
            mode_str = "iPad Pro Only - " + mode_str
        elif args.ipad_mini_only:
            mode_str = "iPad mini Only - " + mode_str
        print(f"============================================================")
        print(f"[*] PTT MacShop Device Analyzer - {mode_str}")
        print(f"[*] Time Range: {time_str} | Threads: {args.workers}")
        print(f"============================================================")
        if args.ipad_pro_only:
            crawler.crawl_ipad_pro(years=args.years, days=args.days, max_pages=args.max_pages, max_workers=args.workers, full_scan=args.full)
        elif args.ipad_mini_only:
            crawler.crawl_ipad_mini(years=args.years, days=args.days, max_pages=args.max_pages, max_workers=args.workers, full_scan=args.full)
        else:
            crawler.crawl_all(years=args.years, days=args.days, max_pages=args.max_pages, max_workers=args.workers, full_scan=args.full)

    if not args.serve_only and not args.skip_crawl and not args.skip_refresh:
        print(f"\n[*] Refreshing status for recent non-sold articles (past {args.refresh_days} days)...")
        crawler.refresh_stale_statuses(max_age_days=args.refresh_days, max_workers=args.workers)

    if not args.serve_only:
        print("\n[*] Running statistical analysis & JSON generation...")
        analyzer.analyze(force_reparse=args.reparse)

    url = f"http://localhost:{args.port}/web/"
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    start_server(args.port)

if __name__ == "__main__":
    main()
