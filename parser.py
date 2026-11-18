import json
import re
import datetime
from bs4 import BeautifulSoup

# Series detection map
SERIES_MAP = {
    "18": "iPhone 18",
    "17": "iPhone 17",
    "16": "iPhone 16",
    "15": "iPhone 15",
    "14": "iPhone 14",
    "13": "iPhone 13",
}

# Sub-model normalization rules per series
SERIES_VALID_SUBMODELS = {
    "iPhone 13": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro'), ('mini', r'(?i)mini')],
    "iPhone 14": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro'), ('Plus', r'(?i)plus')],
    "iPhone 15": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro'), ('Plus', r'(?i)plus')],
    "iPhone 16": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro'), ('Plus', r'(?i)plus')],
    "iPhone 17": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro'), ('Plus', r'(?i)plus')],
    "iPhone 18": [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro')],
}

# Capacity normalization rules (using lookaround to support Chinese character boundaries and standalone numbers)
CAPACITY_PATTERNS = [
    (r'(?i)(?<!\d)2\s*(?:tb|t(?![a-zA-Z\d]))', '2TB'),
    (r'(?i)(?<!\d)1\s*(?:tb|t(?![a-zA-Z\d]))', '1TB'),
    (r'(?i)(?<!\d)512\s*(?:g\s*b?|g)?(?!\d)', '512G'),
    (r'(?i)(?<!\d)256\s*(?:g\s*b?|g)?(?!\d)', '256G'),
    (r'(?i)(?<!\d)128\s*(?:g\s*b?|g)?(?!\d)', '128G'),
    (r'(?i)(?<!\d)64\s*(?:g\s*b?|g)?(?!\d)', '64G'),
]

# Official released capacities table for strict validation
VALID_MODEL_CAPACITIES = {
    # iPhone 13
    "iPhone 13 mini": ["128G", "256G", "512G"],
    "iPhone 13": ["128G", "256G", "512G"],
    "iPhone 13 Pro": ["128G", "256G", "512G", "1TB"],
    "iPhone 13 Pro Max": ["128G", "256G", "512G", "1TB"],
    # iPhone 14
    "iPhone 14": ["128G", "256G", "512G"],
    "iPhone 14 Plus": ["128G", "256G", "512G"],
    "iPhone 14 Pro": ["128G", "256G", "512G", "1TB"],
    "iPhone 14 Pro Max": ["128G", "256G", "512G", "1TB"],
    # iPhone 15
    "iPhone 15": ["128G", "256G", "512G"],
    "iPhone 15 Plus": ["128G", "256G", "512G"],
    "iPhone 15 Pro": ["128G", "256G", "512G", "1TB"],
    "iPhone 15 Pro Max": ["256G", "512G", "1TB"],  # No 128G
    # iPhone 16
    "iPhone 16": ["128G", "256G", "512G"],
    "iPhone 16 Plus": ["128G", "256G", "512G"],
    "iPhone 16 Pro": ["128G", "256G", "512G", "1TB"],
    "iPhone 16 Pro Max": ["256G", "512G", "1TB"],  # No 128G
    # iPhone 17
    "iPhone 17": ["128G", "256G", "512G"],
    "iPhone 17 Plus": ["128G", "256G", "512G"],
    "iPhone 17 Pro": ["256G", "512G", "1TB", "2TB"],
    "iPhone 17 Pro Max": ["256G", "512G", "1TB", "2TB"],  # No 128G
    # iPhone 18
    "iPhone 18": ["128G", "256G", "512G"],
    "iPhone 18 Pro": ["256G", "512G", "1TB", "2TB"],      # No 128G
    "iPhone 18 Pro Max": ["256G", "512G", "1TB", "2TB"],  # No 128G
    # iPad mini 6 (Only 64G and 256G)
    "iPad mini 6 (WiFi)": ["64G", "256G"],
    "iPad mini 6 (Cellular)": ["64G", "256G"],
    # iPad mini 7 (Only 128G, 256G, 512G)
    "iPad mini 7 (WiFi)": ["128G", "256G", "512G"],
    "iPad mini 7 (Cellular)": ["128G", "256G", "512G"],
    # iPad mini 5 (Only 64G and 256G)
    "iPad mini 5 (WiFi)": ["64G", "256G"],
    "iPad mini 5 (Cellular)": ["64G", "256G"],
    # iPad mini 4 (16G, 32G, 64G, 128G)
    "iPad mini 4 (WiFi)": ["16G", "32G", "64G", "128G"],
    "iPad mini 4 (Cellular)": ["16G", "32G", "64G", "128G"],
}

# Sold keywords
SOLD_KEYWORDS = [
    '已售出', '（已售出）', '(已售出)', '[已售出]', '【已售出】',
    '已售', '（已售）', '(已售)', '[已售]', '【已售】',
    '售出', '（售出）', '(售出)', '[售出]', '【售出】',
    '己售出', '己售', '已賣出'
]

# Reserved keywords (暫售)
RESERVED_KEYWORDS = [
    '暫售', '（暫售）', '(暫售)', '[暫售]', '【暫售】',
    '暫售中', '暫售勿擾', '暫售勿信', '暫售勿來信',
    '已暫售', '保留中', '暫保留'
]

# Pending keywords (洽中)
PENDING_KEYWORDS = [
    '洽中', '（洽中）', '(洽中)', '[洽中]', '【洽中】',
    '來信眾多洽中', '面交中'
]

# Pure accessory keywords
ACCESSORY_KEYWORDS = [
    '手機殼', '保護殼', '防摔殼', '透明殼', '聰穎殼', '極薄殼', '原廠殼', '矽膠殼', '織紋殼',
    '皮革殼', '磁吸殼', '軍規殼', '散熱殼', '清水套', '保護套', '皮套', '邊框條', '邊框', '背蓋', '背板', '手機夾片',
    '鋼化膜', '保護貼', '玻璃貼', '保貼', '鏡頭貼', '鏡頭膜', '類紙膜', '水凝膜', '背貼', '包膜',
    '貼膜', '防窺膜', '防窺貼', '殼貼',
    '犀牛盾', 'casetify', 'caudabe', 'hoda', '惡魔殼', 'devilcase', 'uag', 'spigen',
    'torras', '圖拉斯', '閃魔', 'imos', 'benks', 'alto', 'casefinite', 'moft',
    'mageasy', '魚骨', 'pitaka', 'supcase', 'jtlegend', 'switcheasy',
    '充電線', '傳輸線', '原廠線', '充電頭', '原廠盒', '空盒', '掛繩', '支架', '轉接線', '轉接頭', '耳機線', '錶帶'
]

def is_pure_accessory_title(title):
    if not title:
        return False
    t_lower = title.lower()
    clean_t = re.sub(r'\[\s*販售.*?\]|【\s*販售.*?】', '', t_lower).strip()

    # If any accessory keyword in title
    has_acc = any(kw in clean_t for kw in ACCESSORY_KEYWORDS)
    if not has_acc:
        return False

    has_gift = any(w in clean_t for w in ['送', '附', '含', '贈', '帶'])
    has_cap = bool(re.search(r'\b(64|128|256|512)\s*g|\b(1|2)\s*t\b', clean_t))

    # If title has accessory word, and lacks gift word and capacity -> pure accessory
    if not has_gift and not has_cap:
        return True

    # If title ends with an accessory term without gift word
    title_no_brackets = re.sub(r'\(.*?\)|（.*?）|\[.*?\]|【.*?】|\s+', ' ', clean_t).strip()
    if re.search(r'(?:手機殼|保護殼|防摔殼|透明殼|聰穎殼|極薄殼|原廠殼|矽膠殼|織紋殼|鋼化膜|保護貼|玻璃貼|保貼|鏡頭貼|鏡頭膜|保護套|皮套|殼貼)$', title_no_brackets):
        if not has_gift:
            return True

    return False

def is_accessory_item(item_model_str, title, price=None):
    # 1. Check item_model_str
    m_lower = (item_model_str or '').lower()
    for kw in ACCESSORY_KEYWORDS:
        if kw in m_lower:
            has_phone_indicator = any(p in m_lower for p in ['手機', '主機', '機子', '本體']) and not any(k in m_lower for k in ['手機殼', '手機套', '手機夾片'])
            has_gift_in_item = any(g in m_lower for g in ['送', '附', '含', '+', '加', '贈'])
            if not has_phone_indicator and not has_gift_in_item:
                return True

    # 2. Check title
    if is_pure_accessory_title(title):
        return True

    # 3. If title mentions accessory and price could not be found (or below device threshold)
    t_lower = title.lower()
    clean_t = re.sub(r'\[\s*販售.*?\]|【\s*販售.*?】', '', t_lower).strip()
    if any(kw in clean_t for kw in ACCESSORY_KEYWORDS):
        if price is None:
            return True

    return False

def clean_text(text):
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text).strip()

def clean_block_template(text):
    if not text:
        return ""
    patterns = [
        r'不得超過台灣官方定價[。.]?',
        r'售出後修改價格至不可視者水桶(?:並劣退)?[。.]?',
        r'可憑商品序號至\s*Apple\s*官網查詢\s*(?:https?://\S+)?[。.]?',
        r'詳述有什麼或缺少什麼配件[。.]?',
        r'5001元以上的商品只可面交或透過第三方代收平台交易[，,]不可先收款後寄送[。.]?',
        r'所有商品皆需附實物照[^\n\r]*',
        r'且每一張照片皆需與清晰易見[^\n\r]*',
        r'違反者[，,]\s*刪文並水桶[^\n\r]*',
        r'\*\[[0-9;]*m',
    ]
    cleaned = text
    for pat in patterns:
        cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE)
    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
    return '\n'.join(lines)

def extract_block(tag, next_tags, text):
    open_b = r'[\[［【]'
    close_b = r'[\]］】]'
    pat = rf'{open_b}\s*{tag}\s*{close_b}\s*[:：]?\s*(.*?)(?={open_b}\s*(?:' + '|'.join(next_tags) + rf')\s*{close_b}|\Z)'
    m = re.search(pat, text, re.DOTALL)
    return m.group(1).strip() if m else ''

def split_items_flexibly(block_text):
    if not block_text:
        return {}
    lines = [l.strip() for l in block_text.split('\n') if l.strip()]
    items = {}

    circled_map = {
        '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
        '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
        '一': '1', '二': '2', '三': '3',
    }

    # PTT often puts the item number on its own line, followed by the item on
    # the next line (e.g. "1." then "iPad mini 6 ..."). Map those device lines
    # before the inline-number parser so empty numbered entries are not created.
    marker_pattern = r'^[\(（]?([0-9A-Za-z①-⑤❶-❺一二三]+)[\)）\.、\-]$'
    for idx, line in enumerate(lines[:-1]):
        marker = re.match(marker_pattern, line.strip())
        if not marker:
            continue
        for candidate in lines[idx + 1:]:
            if re.match(marker_pattern, candidate.strip()):
                break
            if re.search(r'(?i)iphone|ipad', candidate):
                raw_key = marker.group(1).strip()
                norm_key = circled_map.get(raw_key, raw_key.upper())
                items[norm_key] = candidate.strip()
                break

    pattern = r'^[\(（]?([0-9A-Za-z①-⑤❶-❺一二三]+)[\)）\.、\s\-]+(.*)$'
    for line in lines:
        if re.fullmatch(marker_pattern, line.strip()):
            continue
        # A dotted PTT price such as "1.8500" is a price, not item 1 with value 8500.
        if re.fullmatch(r'\d{1,2}\.\d{3,4}', line.strip()):
            continue
        m = re.match(pattern, line)
        if m:
            raw_key = m.group(1).strip()
            norm_key = circled_map.get(raw_key, raw_key.upper())
            if len(norm_key) <= 2:
                items[norm_key] = m.group(2).strip()
                continue
        if line and line[0] in circled_map:
            items[circled_map[line[0]]] = line[1:].strip()

    if len(items) <= 1 and re.search(r'\b1[\.、\)]\s*.*?\b2[\.、\)]\s*', block_text):
        inline = re.findall(r'(?:^|\s)[\(（]?([0-9A-Za-z]+)[\)）\.、\-]\s*([^\n\r]+?)(?=(?:\s+[\(（]?[0-9A-Za-z]+[\)）\.、\-]|\Z))', block_text)
        for num_tag, val in inline:
            items[num_tag.upper()] = val.strip()

    # Fallback: if not explicitly numbered, but multiple lines each describe a device
    if len(items) <= 1 and len(lines) >= 2:
        device_lines = [l for l in lines if re.search(r'(?i)iphone|ipad', l)]
        if len(device_lines) >= 2:
            items = {}
            for idx, dl in enumerate(device_lines, 1):
                items[str(idx)] = dl

    return items

def check_sold_status(title, body_text, price_str, push_status=None):
    clean_title = re.sub(r'\[\s*販售.*?\]|【\s*販售.*?】', '', title)
    
    clean_price = clean_block_template(price_str)
    # Remove post-sale condition clauses like '售出後...' (e.g. 售出後個人保固3天, 售出後概不退換)
    check_price = re.sub(r'售出後[^\n\r，。,.]*', '', clean_price)

    # 1. Check Sold
    sold_in_title = any(kw in clean_title for kw in SOLD_KEYWORDS)
    sold_in_price = any(kw in check_price for kw in SOLD_KEYWORDS)
    main_body = body_text.split('★請再次確認')[0] if body_text else ""
    check_body = re.sub(r'售出後[^\n\r，。,.]*', '', clean_block_template(main_body))
    sold_in_body = sold_in_price or any(kw in check_body for kw in ['已售出', '已售', '（售出）', '(售出)', '【售出】'])

    # 2. Check Reserved (暫售)
    reserved_in_title = any(kw in clean_title for kw in RESERVED_KEYWORDS)
    reserved_in_price = any(kw in check_price for kw in RESERVED_KEYWORDS)
    reserved_in_body = reserved_in_price or any(kw in check_body for kw in RESERVED_KEYWORDS)

    # 3. Check Pending (洽中)
    pending_in_title = any(kw in clean_title for kw in PENDING_KEYWORDS)
    pending_in_price = any(kw in check_price for kw in PENDING_KEYWORDS)
    pending_in_body = pending_in_price or any(kw in check_body for kw in PENDING_KEYWORDS)

    if sold_in_title or sold_in_price or sold_in_body:
        status = '已售出'
    elif reserved_in_title or reserved_in_price or reserved_in_body:
        status = '暫售'
    elif pending_in_title or pending_in_price or pending_in_body:
        status = '洽中'
    else:
        status = '販售中'

    if push_status:
        status = push_status
        if push_status == '已售出':
            sold_in_body = 1

    return status, 1 if sold_in_title else 0, 1 if (sold_in_body or push_status == '已售出') else 0

# Realistic minimum price thresholds to prevent bundle accessories (AirPods, Apple Watch, Apple Pencil, cases)
# from being mistaken as phone prices. Any price < 3000 is strictly rejected across the board.
GLOBAL_MIN_PRICE = 3000
MIN_SERIES_PRICE = {
    "iPhone 18": 25000,
    "iPhone 17": 15000,
    "iPhone 16": 12000,
    "iPhone 15": 8000,
    "iPhone 14": 5500,
    "iPhone 13": 3500,
    "iPad mini 7": 8000,
    "iPad mini 6": 4500,
    "iPad mini 5": 2500,
    "iPad mini 4": 1500,
    "iPad Pro": 5000,
}

def parse_price_candidates(text):
    candidates = []
    if not text:
        return candidates

    # 1. '萬' patterns: e.g. 2萬, 2.5萬, 2萬5, 1萬9, 3萬2000
    wan_matches = re.finditer(r'(\d+(?:\.\d+)?)\s*萬(?:\s*(\d{1,4}))?', text)
    for wm in wan_matches:
        base = float(wm.group(1)) * 10000
        extra_s = wm.group(2)
        if extra_s:
            if len(extra_s) == 1: extra = int(extra_s) * 1000
            elif len(extra_s) == 2: extra = int(extra_s) * 100
            elif len(extra_s) == 3: extra = int(extra_s) * 10
            else: extra = int(extra_s)
            val = int(base + extra)
        else:
            val = int(round(base))
        if GLOBAL_MIN_PRICE <= val <= 100000:
            candidates.append(val)

    # 2. 'k' patterns: e.g. 20k, 32k
    k_matches = re.finditer(r'(?<![a-zA-Z\d])(\d{2,3})\s*k\b', text, re.IGNORECASE)
    for km in k_matches:
        val = int(km.group(1)) * 1000
        if GLOBAL_MIN_PRICE <= val <= 100000:
            candidates.append(val)

    # PTT often joins a numbered item and its price as "1.8500"; here the
    # leading 1 is the item number, so the actual price is NT$8,500.
    dotted_price_matches = list(re.finditer(r'(?<!\d)([1-9])\.(\d{3,4})(?!\d)', text))
    for dm in dotted_price_matches:
        val = int(dm.group(2))
        if GLOBAL_MIN_PRICE <= val <= 100000:
            candidates.append(val)

    # 3. Standard numeric patterns: e.g. 32000, 32,000, NT$20000
    # Remove numbered-item price syntax first to avoid reading item indexes as amounts.
    standard_price_text = re.sub(r'(?<!\d)[1-9]\.\d{3,4}(?!\d)', ' ', text)
    raw_nums = re.findall(r'(\d[\d,]{3,6})', standard_price_text)
    for rn in raw_nums:
        clean_num = int(rn.replace(',', ''))
        if GLOBAL_MIN_PRICE <= clean_num <= 100000:
            candidates.append(clean_num)

    return candidates

def extract_prices(price_str, body_text, series=None):
    raw_candidates = parse_price_candidates(price_str)
                
    if not raw_candidates and body_text:
        match = re.search(r'[\[［【]?\s*(?:售價|價格)\s*[\]］】]?\s*[:：]?\s*([^\n\r]+(?:\n[^\n\r]+)?)', body_text)
        if match:
            raw_chunk = match.group(1)
            raw_candidates = parse_price_candidates(raw_chunk)

    if not raw_candidates:
        return None

    # If series is known, apply series-specific minimum threshold to filter out accessories
    min_thresh = MIN_SERIES_PRICE.get(series, GLOBAL_MIN_PRICE)
    series_candidates = [p for p in raw_candidates if p >= min_thresh]

    prices = series_candidates if series_candidates else []
    if not prices:
        # No candidate meets the realistic device threshold (likely only accessories were priced)
        return None
                    
    if len(prices) >= 2:
        if '降' in price_str or '改' in price_str:
            return min(prices)
        return prices[0]
    elif len(prices) == 1:
        return prices[0]
    return None

def extract_battery(text):
    m = re.search(r'電池(?:健康度)?\s*[:：]?\s*(\d{2,3})\s*%', text)
    if m:
        val = int(m.group(1))
        if 50 <= val <= 100:
            return val
    return None

def extract_warranty(text):
    if not text:
        return "已過保"
    m = re.search(r'\[保固(?:日期|狀態)?\]\s*[:：]?\s*([^\n\r<]{2,60})', text)
    target = m.group(1).strip() if m else text

    if re.search(r'(?i)apple\s*care\s*\+?|\bac\+\b', target) or re.search(r'(?i)apple\s*care\s*\+?|\bac\+\b', text):
        return 'AppleCare+'
    if re.search(r'未開通|開通後|尚未開通|啟用後|拆封後|連網後|聯網後|全新.*一年', target):
        return '全新/未開通'
    if re.search(r'過保|已過保|無保', target):
        return '已過保'

    dm = re.search(r'(202[4-8])[年/.-](\d{1,2})[月/.-]?(\d{1,2})?', target)
    if dm:
        y, m_val, d = dm.group(1), dm.group(2).zfill(2), (dm.group(3) or '01').zfill(2)
        date_str = f'{y}-{m_val}-{d}'
        if date_str >= '2026-09-20':
            return f'保內 ({y}/{m_val})'
        else:
            return '已過保'

    if re.search(r'保固中|原廠保|原廠保固', target):
        return '原廠保內'
    return '已過保'

def extract_location(title, body_text):
    m = re.search(r'\[販售(?:/([^\s\[\]]+))?\]', title)
    if m and m.group(1):
        loc = m.group(1).strip()
        if len(loc) <= 8 and not any(k in loc for k in ['售出', '洽中', '暫售', 'iPhone', 'iPad']):
            return loc
    m2 = re.search(r'\[販售\]\s*([^\s\[\]]+)', title)
    if m2:
        loc = m2.group(1).strip()
        if len(loc) <= 6 and not any(k in loc for k in ['售出', '洽中', '暫售', 'iPhone', 'iPad']):
            return loc
    return "全國"

def extract_author_pushes(soup, author):
    author_id = ""
    if author:
        clean_id = re.sub(r'\(.*?\)', '', author).strip()
        if clean_id:
            author_id = clean_id.split()[0].lower()

    if not author_id:
        for meta in soup.find_all('div', class_='article-metaline'):
            tag = meta.find('span', class_='article-meta-tag')
            val = meta.find('span', class_='article-meta-value')
            if tag and val and '作者' in tag.text:
                clean_id = re.sub(r'\(.*?\)', '', val.text).strip()
                if clean_id:
                    author_id = clean_id.split()[0].lower()
                break

    if not author_id:
        return []

    author_pushes = []
    pushes = soup.find_all('div', class_='push')
    for push in pushes:
        uid_el = push.find('span', class_='push-userid')
        cnt_el = push.find('span', class_='push-content')
        if not uid_el or not cnt_el:
            continue
        uid = uid_el.text.strip().rstrip(':').strip().lower()
        if uid == author_id:
            cnt = re.sub(r'^[:：\s]+', '', cnt_el.text).strip()
            if cnt:
                author_pushes.append(cnt)

    return author_pushes

def determine_push_status(author_pushes, item_key=None):
    if not author_pushes:
        return None
    current_status = None
    for cnt in author_pushes:
        # If item_key is provided (e.g. '1', '2' for multi-item posts)
        if item_key:
            other_keys = [str(k) for k in range(1, 10) if str(k) != str(item_key)]
            if any(re.search(rf'(?:^|\b){k}[\.、\s\-:]*(?:售出|已售|洽中|暫售)', cnt) for k in other_keys):
                if not re.search(rf'(?:^|\b){item_key}[\.、\s\-:]*(?:售出|已售|洽中|暫售)', cnt):
                    continue

        # Check reopen/active
        if any(neg in cnt for neg in ['未售出', '尚未售出', '還沒售出', '未售', '買家棄單', '繼續販售', '繼續賣', '重新釋出', '釋出']):
            current_status = '販售中'
            continue

        # Check sold
        if any(kw in cnt for kw in ['已售出', '已售', '售出', '賣出', '已賣出', '感謝macshop', '感謝MacShop', '感謝ptt', '感謝本版', '感謝版', '面交完成', '已面交']):
            current_status = '已售出'
        # Check reserved
        elif any(kw in cnt for kw in ['暫售', '已暫售', '保留中', '暫保留']):
            current_status = '暫售'
        # Check pending
        elif any(kw in cnt for kw in ['洽中', '已洽中', '面交中', '來信眾多洽中']):
            current_status = '洽中'

    return current_status

def parse_single_phone(item_model_str, item_spec_str, item_price_str, title, body_text, article_id, url, timestamp, date_str, location, battery, is_multi_item=False, push_status=None, warranty=None):
    """
    Parses a single device pair and checks supported iPhone, iPad mini, and iPad Pro listings.
    """
    if is_multi_item:
        text_to_check = f"{item_model_str} {item_spec_str}".lower()
    else:
        text_to_check = f"{title} {item_model_str} {item_spec_str}".lower()
    normalized_text_to_check = re.sub(r'(?i)\bi\s*pad\s*mimi\b', 'ipad mini', text_to_check)
    normalized_text_to_check = re.sub(r'(?i)\bi\s*pad\s*mini\b', 'ipad mini', normalized_text_to_check)

    # If item or title only sells accessories without phone
    if is_accessory_item(item_model_str, title, price=None):
        return None

    capacity_explicit = False
    quality_flags = []
    # iPad Pro: group generations under one searchable category, retaining size/chip/connectivity in model.
    if re.search(r'(?i)i\s*pad\s*pro\b', f"{text_to_check} {title}"):
        device_type = 'ipad_pro'
        found_series = 'iPad Pro'
        text_for_model = f"{item_model_str} {item_spec_str} {title}" if not is_multi_item else f"{item_model_str} {item_spec_str}"
        size_match = re.search(r'(?i)(11|12\.9|13)\s*(?:吋|inch|英吋|\")?', text_for_model)
        size = f"{size_match.group(1)}-inch" if size_match else "尺寸未明"
        chip_match = re.search(r'(?i)\b(M[1-5])\b', text_for_model)
        chip = chip_match.group(1).upper() if chip_match else "世代未明"
        if not chip_match:
            quality_flags.append("世代未辨識")
        if not size_match:
            quality_flags.append("尺寸未辨識")
        is_cellular = any(k in text_for_model.lower() for k in ['cellular', '行動網路', '插卡', '5g', 'lte'])
        full_model = f"iPad Pro {size} {chip} ({'Cellular' if is_cellular else 'WiFi'})"
        capacity = None
        text_for_cap = f"{item_model_str} {item_spec_str}" if is_multi_item else f"{item_model_str} {item_spec_str} {title}"
        for pat, cap in CAPACITY_PATTERNS:
            if re.search(pat, text_for_cap):
                capacity = cap
                capacity_explicit = True
                break
        capacity = capacity or "未標示"
    # 1. Check iPad mini
    elif 'ipad mini' in normalized_text_to_check or 'ipadmini' in normalized_text_to_check:
        device_type = 'ipad_mini'
        found_series = None
        if re.search(r'(?i)(?:mini\s*7(?!\d)|mini\s*第?\s*7\s*代|mini\s*\(?\s*a17|\ba17\s*pro\b)', normalized_text_to_check):
            found_series = 'iPad mini 7'
        elif re.search(r'(?i)(?:mini\s*6(?!\d)|mini\s*第?\s*6\s*代)', normalized_text_to_check):
            found_series = 'iPad mini 6'
        elif re.search(r'(?i)(?:mini\s*5(?!\d)|mini\s*第?\s*5\s*代|mini\s*五代)', normalized_text_to_check):
            found_series = 'iPad mini 5'
        elif re.search(r'(?i)(?:mini\s*4(?!\d)|mini\s*第?\s*4\s*代|mini\s*四代)', normalized_text_to_check):
            found_series = 'iPad mini 4'
        else:
            return None

        is_cellular = bool(re.search(r'(?i)\b(?:5g|4g|lte|cellular|esim)\b|行動網路|插卡|電信版', normalized_text_to_check))
        connectivity = "Cellular" if is_cellular else "WiFi"
        full_model = f"{found_series} ({connectivity})"

        capacity = None
        text_for_cap = f"{item_model_str} {item_spec_str}" if is_multi_item else f"{item_model_str} {item_spec_str} {title}"
        for pat, cap in CAPACITY_PATTERNS:
            if re.search(pat, text_for_cap):
                capacity = cap
                capacity_explicit = True
                break
        if not capacity:
            capacity = "未標示"

    else:
        # Check iPhone
        device_type = 'iphone'
        found_series = None
        for s_num in ["18", "17", "16", "15", "14", "13"]:
            pattern = rf'(?i)iphone\s*{s_num}\b|\bi{s_num}\b'
            if re.search(pattern, item_model_str) or (not is_multi_item and re.search(pattern, title)):
                found_series = f"iPhone {s_num}"
                break
        if not found_series:
            return None

        submodel = "標準版"
        text_for_submodel = item_model_str if is_multi_item else f"{item_model_str} {title}"
        valid_subs = SERIES_VALID_SUBMODELS.get(found_series, [('Pro Max', r'(?i)pro\s*max'), ('Pro', r'(?i)pro')])
        for name, pat in valid_subs:
            if re.search(pat, text_for_submodel):
                submodel = name
                break
        full_model = f"{found_series} {submodel}".replace(" 標準版", "")

        capacity = None
        text_for_cap = f"{item_model_str} {item_spec_str}" if is_multi_item else f"{item_model_str} {item_spec_str} {title}"
        for pat, cap in CAPACITY_PATTERNS:
            if re.search(pat, text_for_cap):
                capacity = cap
                capacity_explicit = True
                break
        if not capacity:
            capacity = "未標示"

    # Strict Validation against Apple's Official Released Capacities
    valid_caps = VALID_MODEL_CAPACITIES.get(full_model)
    if device_type == 'ipad_pro':
        valid_caps = None
    if not valid_caps and device_type != 'ipad_pro':
        # Invalid / Phantom model that Apple never released (e.g. iPhone 15 mini, iPhone 13 Plus)
        return None

    if valid_caps and capacity_explicit and capacity not in valid_caps:
        quality_flags.append("容量規格不符")
        found_valid = None
        for pat, cap in CAPACITY_PATTERNS:
            if cap in valid_caps and re.search(pat, text_for_cap):
                found_valid = cap
                break
        if found_valid:
            capacity = found_valid
        else:
            capacity = "未標示"

    # Status check
    status, sold_in_title, sold_in_body = check_sold_status(title, body_text, item_price_str, push_status=push_status)

    price_candidates = set(parse_price_candidates(item_price_str))
    price = extract_prices(item_price_str, body_text if not item_price_str else "", series=found_series)
    if not capacity_explicit:
        quality_flags.append("容量未明確標示")
    if price is None:
        quality_flags.append("價格未辨識")
    if len(price_candidates) > 1 and not any(word in item_price_str for word in ('降', '改')):
        quality_flags.append("價格欄含多個金額")
    if re.search(r'合售|搭售|不拆售|整組|一起帶|組合價|多件優惠', title):
        quality_flags.append("疑似合售")

    flag_penalties = {
        "世代未辨識": 15, "尺寸未辨識": 10, "容量未明確標示": 15,
        "價格未辨識": 35, "價格欄含多個金額": 25, "疑似合售": 25
    }
    quality_score = max(0, 100 - sum(flag_penalties.get(flag, 0) for flag in quality_flags))

    # Reject cases where price is missing or it is an accessory
    if is_accessory_item(item_model_str, title, price=price):
        return None

    cleaned_price_str = clean_block_template(item_price_str)
    if price is None and status == '已售出':
        raw_price_str = cleaned_price_str or "售出未留價格"
    else:
        raw_price_str = cleaned_price_str

    return {
        "article_id": article_id,
        "device_type": device_type,
        "series": found_series,
        "model": full_model,
        "capacity": capacity,
        "price": price,
        "status": status,
        "sold_in_title": sold_in_title,
        "sold_in_body": sold_in_body,
        "location": location,
        "battery": battery,
        "warranty": warranty or "已過保",
        "date_str": date_str,
        "timestamp": timestamp,
        "url": url,
        "title": clean_text(title),
        "raw_price_str": clean_text(raw_price_str),
        "quality_score": quality_score,
        "quality_flags": json.dumps(quality_flags, ensure_ascii=False),
    }

def parse_article_html(article_id, url, title, author, timestamp, raw_html):
    if not raw_html:
        return []
    soup = BeautifulSoup(raw_html, 'lxml')
    main = soup.find('div', id='main-content')
    if not main:
        return []
        
    body_text = main.text
    # Strip PTT client signatures and footer before block extraction
    body_text = re.sub(r'(?i)sent from.*?on my iphone[^\n\r]*', '', body_text)
    body_text = re.sub(r'(?i)sent from[^\n\r]+', '', body_text)
    body_text = re.sub(r'※\s*發信站:.*', '', body_text, flags=re.DOTALL)

    date_dt = datetime.datetime.fromtimestamp(timestamp)
    date_str = date_dt.strftime("%Y-%m-%d")

    # Title check - must be [販售] or variants
    if not re.search(r'\[\s*販售.*?\]|【\s*販售.*?】', title):
        return []

    # Check negative title (only accessories)
    if is_pure_accessory_title(title):
        return []

    location = extract_location(title, body_text)
    battery = extract_battery(body_text)
    warranty = extract_warranty(body_text)

    # Extract Blocks
    model_block = clean_block_template(extract_block('型號', ['規格', '保固', '售價', '價格'], body_text))
    spec_block = clean_block_template(extract_block('規格', ['保固', '盒裝配件', '售價', '價格'], body_text))
    price_block = clean_block_template(extract_block(r'(?:售價|價格)', ['交易方式/地點', '交易方式', '交易地點', '連絡方式', '商品照/補充說明'], body_text))

    model_items = split_items_flexibly(model_block)
    spec_items = split_items_flexibly(spec_block)
    price_items = split_items_flexibly(price_block)

    author_pushes = extract_author_pushes(soup, author)

    results = []

    # Case A: Multi-item listing (e.g. 1. iPad Pro 2. iPad Mini 7)
    if len(model_items) > 1:
        p_lines = [l.strip() for l in price_block.split('\n') if l.strip()]
        for idx, (k, m_val) in enumerate(model_items.items()):
            s_val = spec_items.get(k, spec_block)
            p_val = price_items.get(k, "")
            if not p_val and idx < len(p_lines):
                p_val = p_lines[idx]
            item_push_status = determine_push_status(author_pushes, item_key=k)
            parsed = parse_single_phone(
                item_model_str=m_val,
                item_spec_str=s_val,
                item_price_str=p_val,
                title=title,
                body_text=body_text,
                article_id=article_id,
                url=url,
                timestamp=timestamp,
                date_str=date_str,
                location=location,
                battery=battery,
                is_multi_item=True,
                push_status=item_push_status,
                warranty=warranty
            )
            if parsed:
                results.append(parsed)

    # Case B: Single item or unnumbered block
    if not results:
        item_push_status = determine_push_status(author_pushes, item_key=None)
        parsed = parse_single_phone(
            item_model_str=model_block,
            item_spec_str=spec_block,
            item_price_str=price_block,
            title=title,
            body_text=body_text,
            article_id=article_id,
            url=url,
            timestamp=timestamp,
            date_str=date_str,
            location=location,
            battery=battery,
            is_multi_item=False,
            push_status=item_push_status,
            warranty=warranty
        )
        if parsed:
            results.append(parsed)

    return results
