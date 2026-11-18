# PTT MacShop iPhone、iPad mini 與 iPad Pro 二手價格分析系統

自動抓取 PTT MacShop 板（批踢踢二手交易板）近 2 年內支援機型的二手販售貼文，辨識「掛售價」與「已售出成交價」，計算價格區間與月度走勢，並提供分類查詢的互動式網頁儀表板。

---

## 🌟 核心特色

1. **分類分頁查詢 (Tab Switcher)**：
   - 📱 **iPhone 系列 (iPhone 13 ~ 18)**：支援標準版、mini、Plus、Pro、Pro Max 與 128G~2TB 各容量規格。
   - 📋 **iPad mini 系列 (iPad mini 6 & 7)**：支援 WiFi 版與 Cellular 行動網路版、64G~512G 各容量規格。
   - 📋 **iPad Pro 系列**：涵蓋可辨識的世代晶片、尺寸、連線版本與容量。
2. **近 2 年完整歷史邊界**：利用 PTT URL UNIX 時間戳自動精準比對，爬蟲翻頁至 2 年前（2024-09-20）自動停止。
3. **高效能多執行緒爬蟲 + SQLite 快取**：已下載文章永久快取於 `data/macshop.db`，支援中斷續爬與增量更新。
4. **精準規格與售出判定**：
   - 價格精確萃取（排除保護殼、配件、筆等干擾金額）。
   - 狀態判定（🔴 已售出 / 🟢 販售中 / 🟡 洽中），並比對掛售期望價 vs 實際成交價之價差折讓。
   - 解析信心度與品質疑慮標記；合售、多金額欄位與離群價保留原文供複核，並排除行情統計。
5. **互動式現代化 Web 儀表板**：
   - **成交價格區間長條圖**：最低價、中位數、最高價、掛售期望價對比。
   - **近 24 個月折舊趨勢曲線圖**：觀察各代機型每月平均成交價走勢。
   - **機型與容量行情彙總表**：包含價差折讓與成交比率，點擊可直覺聯動下方明細。
   - **文章明細即時搜尋與多維度篩選**：支援關鍵字（地點、顏色等）、機型、容量、狀態篩選，並提供一鍵匯出 CSV。

---

## 🚀 快速開始

### 1. 安裝需求套件
```bash
pip install requests beautifulsoup4 lxml numpy
```

### 2. 一鍵啟動（抓取、分析並開啟網頁）
```bash
python run.py
```
> 執行後會自動開始抓取近 2 年資料，完成後自動在瀏覽器中開啟 `http://localhost:8000/web/`。

### 3. 常用指令參數

- **日常極速增量更新（預設行為，數秒內完成）**：
  ```bash
  python run.py
  ```
  > 爬蟲遇到既有快取貼文時會自動早停（Early Stop），且分析器僅解析新文章，避免重複全量爬取與解析。

- **強制全量歷史掃描（回溯完整 2 年）**：
  ```bash
  python run.py --full
  ```

- **只更新 iPad Pro 資料（預設近 2 年增量爬取）**：
  ```bash
  python run.py --ipad-pro-only
  ```
  > 完成後會重新分析本機資料庫並啟動看板；加上 `--full` 可完整回溯指定年限。

- **強制重新解析所有貼文（例如更新正規表達式或解析規則後）**：
  ```bash
  python run.py --reparse
  ```
  > 品質評分首次啟用時，可用 `python run.py --skip-crawl --reparse` 重新整理本機快取資料，不需重新爬取。

- **快速測試（例如每系列僅抓最新 3 頁）**：
  ```bash
  python run.py --max-pages 3
  ```

- **不重新抓取，直接用現有資料庫快速產生報告並啟動網頁**：
  ```bash
  python run.py --skip-crawl
  ```

- **純瀏覽模式（僅啟動本地儀表板伺服器，不分析資料庫）**：
  ```bash
  python run.py --serve-only
  ```

- **自訂年限與執行緒**：
  ```bash
  python run.py --years 1.5 --workers 8
  ```

---

## 📁 專案檔案結構

```
ptt_macshop_analyzer/
├── database.py       # SQLite 本地快取與資料庫管理
├── crawler.py        # 多執行緒 PTT 爬蟲（含 2 年邊界判定）
├── parser.py         # 規格、容量、價格與售出狀態正規化解析引擎
├── analyzer.py       # 統計分析模組（計算區間、中位數、月度走勢）
├── run.py            # 統一 CLI 執行入口與本地 Web Server
├── data/
│   ├── macshop.db    # SQLite 本地快取資料庫
│   └── iphone_data.json # 前端視覺化標準資料檔
└── web/
    ├── index.html    # Tailwind CSS 儀表板頁面
    ├── app.js        # 圖表渲染 (Chart.js)、篩選器、分頁與 CSV 匯出邏輯
    └── styles.css    # 介面風格樣式
```
