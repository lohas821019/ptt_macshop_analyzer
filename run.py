import argparse
import sys
import os
import webbrowser
import http.server
import socketserver
import threading
import time

# Ensure UTF-8 console output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import crawler
import analyzer

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress routine GET request logs
        pass

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
    parser.add_argument("--max-pages", type=int, default=None, help="Max search pages per series (default: unlimited until cutoff)")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent crawl workers (default: 6)")
    parser.add_argument("--full", action="store_true", help="Force full 2-year history crawl instead of incremental update")
    parser.add_argument("--reparse", action="store_true", help="Force re-parsing all raw articles in database")
    parser.add_argument("--skip-crawl", action="store_true", help="Skip crawling, analyze local DB and serve")
    parser.add_argument("--serve-only", action="store_true", help="Only launch local web dashboard")
    parser.add_argument("--port", type=int, default=8000, help="Local server port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")

    args = parser.parse_args()

    if not args.serve_only and not args.skip_crawl:
        mode_str = "Full History Scan" if args.full else "Incremental Scan"
        print(f"============================================================")
        print(f"[*] PTT MacShop iPhone 13~18 Analyzer - {mode_str}")
        print(f"[*] Time Range: Past {args.years} years | Threads: {args.workers}")
        print(f"============================================================")
        crawler.crawl_all(years=args.years, max_pages=args.max_pages, max_workers=args.workers, full_scan=args.full)

    if not args.serve_only:
        print("\n[*] Running statistical analysis & JSON generation...")
        analyzer.analyze(force_reparse=args.reparse)

    url = f"http://localhost:{args.port}/web/"
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    start_server(args.port)

if __name__ == "__main__":
    main()
