// Global state
let rawData = null;
let activeCategory = 'iphone'; // 'iphone' or 'ipad_mini'
let filteredItems = [];
let currentPage = 1;
const pageSize = 15;
let currentSort = { field: 'date', order: 'desc' };
let currentFilters = {
  series: 'ALL',
  model: 'ALL',
  capacity: 'ALL',
  status: 'ALL',
  keyword: ''
};

// Date Range Filter State
let globalMinDate = '2024-09-20';
let globalMaxDate = '2026-09-20';
let currentDateRange = {
  preset: 'all', // 'all', '1y', '6m', '90d', '30d', 'custom'
  startDate: '2024-09-20',
  endDate: '2026-09-20'
};
let currentChartSeries = 'ALL';

let priceChart = null;
let trendChart = null;
let gapChart = null;

const SERIES_ORDER_CONFIG = {
  iphone: ["iPhone 18", "iPhone 17", "iPhone 16", "iPhone 15", "iPhone 14", "iPhone 13"],
  ipad_mini: ["iPad mini 7", "iPad mini 6"]
};
const CAPACITY_ORDER_CONFIG = {
  iphone: ["128G", "256G", "512G", "1TB", "2TB", "64G"],
  ipad_mini: ["64G", "128G", "256G", "512G"]
};

// Initialize Lucide Icons
function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Format date to YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate preset date ranges based on globalMaxDate
function calculatePresetDates(preset) {
  if (preset === 'all') {
    return { startDate: globalMinDate, endDate: globalMaxDate };
  }
  const maxD = new Date(globalMaxDate + 'T00:00:00');
  let startD = new Date(maxD);
  if (preset === '30d') {
    startD.setDate(startD.getDate() - 30);
  } else if (preset === '90d') {
    startD.setDate(startD.getDate() - 90);
  } else if (preset === '6m') {
    startD.setMonth(startD.getMonth() - 6);
  } else if (preset === '1y') {
    startD.setFullYear(startD.getFullYear() - 1);
  }
  const minD = new Date(globalMinDate + 'T00:00:00');
  if (startD < minD) startD = minD;
  return { startDate: formatDate(startD), endDate: globalMaxDate };
}

function setDatePreset(preset) {
  currentDateRange.preset = preset;
  const range = calculatePresetDates(preset);
  currentDateRange.startDate = range.startDate;
  currentDateRange.endDate = range.endDate;
  syncDateControls();
  updateCategoryView();
}

function onCustomDateChange() {
  const startEl = document.getElementById('date-start');
  const endEl = document.getElementById('date-end');
  let sVal = startEl.value || globalMinDate;
  let eVal = endEl.value || globalMaxDate;
  if (sVal > eVal) {
    eVal = sVal;
    endEl.value = eVal;
  }
  currentDateRange.preset = 'custom';
  currentDateRange.startDate = sVal;
  currentDateRange.endDate = eVal;
  syncDateControls();
  updateCategoryView();
}

function resetDateRange() {
  setDatePreset('all');
}

function syncDateControls() {
  const startEl = document.getElementById('date-start');
  const endEl = document.getElementById('date-end');
  if (startEl) {
    startEl.min = globalMinDate;
    startEl.max = globalMaxDate;
    startEl.value = currentDateRange.startDate;
  }
  if (endEl) {
    endEl.min = globalMinDate;
    endEl.max = globalMaxDate;
    endEl.value = currentDateRange.endDate;
  }

  document.querySelectorAll('#date-preset-buttons .date-preset-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === currentDateRange.preset) {
      btn.className = 'date-preset-btn cursor-pointer px-2.5 py-1 text-xs rounded-lg font-semibold bg-purple-600 text-white transition shadow-sm active:scale-95 ring-2 ring-purple-400/50';
    } else {
      btn.className = 'date-preset-btn cursor-pointer px-2.5 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition active:scale-95 ring-0';
    }
  });

  const badgeEl = document.getElementById('kpi-date-badge');
  if (badgeEl) {
    const presetNames = {
      'all': '全部',
      '1y': '近 1 年',
      '6m': '近半年',
      '90d': '近 90 天',
      '30d': '近 30 天',
      'custom': '自訂區間'
    };
    badgeEl.textContent = presetNames[currentDateRange.preset] || '自訂';
  }
}

// Calculate percentile with linear interpolation
function getPercentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const index = (sortedArr.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight);
}

// Calculate summary stats
function calculateStats(prices) {
  if (!prices || prices.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, median: 0, mode: 0, lowest10_avg: 0, p25: 0, p75: 0 };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round(sum / count);
  const median = getPercentile(sorted, 0.5);
  const p25 = getPercentile(sorted, 0.25);
  const p75 = getPercentile(sorted, 0.75);

  // Mode (眾數)
  const freq = {};
  let maxCount = 0;
  for (const p of sorted) {
    freq[p] = (freq[p] || 0) + 1;
    if (freq[p] > maxCount) {
      maxCount = freq[p];
    }
  }
  const modes = Object.keys(freq).filter(p => freq[p] === maxCount).map(Number);
  let mode = 0;
  if (modes.length === 1) {
    mode = modes[0];
  } else if (maxCount > 1) {
    const modeSum = modes.reduce((a, b) => a + b, 0);
    mode = Math.round(modeSum / modes.length / 100) * 100;
  } else {
    mode = median;
  }

  // Lowest 10 average (最低 10 筆平均)
  const lowest10 = sorted.slice(0, Math.min(10, count));
  const lowest10Sum = lowest10.reduce((acc, val) => acc + val, 0);
  const lowest10_avg = lowest10.length > 0 ? Math.round(lowest10Sum / lowest10.length) : 0;

  return { count, min, max, avg, median, mode, lowest10_avg, p25, p75 };
}

// Compute dynamic aggregated data for category and date range
function computeDynamicCategoryData(category, startDate, endDate) {
  if (!rawData || !rawData.items) {
    return {
      summary: {
        total_items: 0, items_with_price: 0, sold_count: 0,
        reserved_count: 0, pending_count: 0, active_count: 0,
        sold_ratio: 0, earliest_date: '', latest_date: '', updated_at: ''
      },
      grouped_stats: [],
      monthly_trends: { months: [], series: {} }
    };
  }

  const seriesOrder = SERIES_ORDER_CONFIG[category] || [];
  const capacityOrder = CAPACITY_ORDER_CONFIG[category] || [];

  const catItems = rawData.items.filter(it => 
    it.device_type === category &&
    (!startDate || it.date >= startDate) &&
    (!endDate || it.date <= endDate)
  );

  const itemsWithPrice = catItems.filter(it => it.price !== null && it.price !== undefined && it.price >= 3000);
  const soldItems = itemsWithPrice.filter(it => it.status === '已售出');
  const reservedItems = itemsWithPrice.filter(it => it.status === '暫售');
  const pendingItems = itemsWithPrice.filter(it => it.status === '洽中');
  const activeItems = itemsWithPrice.filter(it => it.status === '販售中');

  let earliestDate = '';
  let latestDate = '';
  if (catItems.length > 0) {
    earliestDate = catItems.reduce((min, it) => it.date < min ? it.date : min, catItems[0].date);
    latestDate = catItems.reduce((max, it) => it.date > max ? it.date : max, catItems[0].date);
  }

  const summary = {
    total_items: catItems.length,
    items_with_price: itemsWithPrice.length,
    sold_count: soldItems.length,
    reserved_count: reservedItems.length,
    pending_count: pendingItems.length,
    active_count: activeItems.length,
    sold_ratio: itemsWithPrice.length ? Math.round((soldItems.length / itemsWithPrice.length) * 1000) / 10 : 0,
    earliest_date: earliestDate,
    latest_date: latestDate,
    updated_at: rawData.summary ? rawData.summary.updated_at : ''
  };

  // Group by (series, model, capacity)
  const modelCapGroups = {};
  itemsWithPrice.forEach(it => {
    const key = `${it.series}____${it.model}____${it.capacity}`;
    if (!modelCapGroups[key]) {
      modelCapGroups[key] = {
        series: it.series,
        model: it.model,
        capacity: it.capacity,
        sold_prices: [],
        active_prices: [],
        all_prices: [],
        latest_sold: null,
        latest_active: null
      };
    }
    modelCapGroups[key].all_prices.push(it.price);
    if (it.status === '已售出') {
      modelCapGroups[key].sold_prices.push(it.price);
      if (!modelCapGroups[key].latest_sold || it.date > modelCapGroups[key].latest_sold.date || (it.date === modelCapGroups[key].latest_sold.date && (it.id || '') > (modelCapGroups[key].latest_sold.id || ''))) {
        modelCapGroups[key].latest_sold = { price: it.price, date: it.date, id: it.id };
      }
    } else if (it.status === '販售中') {
      modelCapGroups[key].active_prices.push(it.price);
      if (!modelCapGroups[key].latest_active || it.date > modelCapGroups[key].latest_active.date || (it.date === modelCapGroups[key].latest_active.date && (it.id || '') > (modelCapGroups[key].latest_active.id || ''))) {
        modelCapGroups[key].latest_active = { price: it.price, date: it.date, id: it.id };
      }
    }
  });

  const groupedStats = [];
  Object.values(modelCapGroups).forEach(grp => {
    const soldStat = calculateStats(grp.sold_prices);
    const activeStat = calculateStats(grp.active_prices);
    const totalStat = calculateStats(grp.all_prices);
    const soldPct = totalStat.count > 0 ? Math.round((soldStat.count / totalStat.count) * 1000) / 10 : 0;

    let priceDiff = null;
    if (grp.latest_active && grp.latest_sold) {
      priceDiff = grp.latest_active.price - grp.latest_sold.price;
    } else if (activeStat.median > 0 && soldStat.median > 0) {
      priceDiff = activeStat.median - soldStat.median;
    }

    groupedStats.push({
      series: grp.series,
      model: grp.model,
      capacity: grp.capacity,
      total_count: totalStat.count,
      sold_count: soldStat.count,
      sold_ratio: soldPct,
      sold_stats: soldStat,
      active_stats: activeStat,
      total_stats: totalStat,
      latest_sold: grp.latest_sold,
      latest_active: grp.latest_active,
      price_diff: priceDiff,
      sold_prices: grp.sold_prices
    });
  });

  groupedStats.sort((a, b) => {
    const sIdxA = seriesOrder.indexOf(a.series);
    const sIdxB = seriesOrder.indexOf(b.series);
    const sDiff = (sIdxA >= 0 ? sIdxA : 99) - (sIdxB >= 0 ? sIdxB : 99);
    if (sDiff !== 0) return sDiff;

    if (a.model !== b.model) {
      return a.model.localeCompare(b.model);
    }

    const cIdxA = capacityOrder.indexOf(a.capacity);
    const cIdxB = capacityOrder.indexOf(b.capacity);
    return (cIdxA >= 0 ? cIdxA : 99) - (cIdxB >= 0 ? cIdxB : 99);
  });

  // Monthly trends for selected date range
  const sDate = startDate || earliestDate || '2024-09-01';
  const eDate = endDate || latestDate || '2026-09-30';
  const startY = parseInt(sDate.slice(0, 4));
  const startM = parseInt(sDate.slice(5, 7));
  const endY = parseInt(eDate.slice(0, 4));
  const endM = parseInt(eDate.slice(5, 7));

  const continuousMonths = [];
  let cy = startY, cm = startM;
  while ((cy < endY) || (cy === endY && cm <= endM)) {
    continuousMonths.push(`${cy}-${String(cm).padStart(2, '0')}`);
    cm++;
    if (cm > 12) {
      cm = 1;
      cy++;
    }
  }

  const monthlyData = {};
  soldItems.forEach(it => {
    const month = it.date.slice(0, 7);
    if (!monthlyData[month]) {
      monthlyData[month] = {};
    }
    if (!monthlyData[month][it.series]) {
      monthlyData[month][it.series] = [];
    }
    monthlyData[month][it.series].push(it.price);
  });

  const monthlyTrends = {
    months: continuousMonths,
    series: {}
  };

  seriesOrder.forEach(ser => {
    const seriesPrices = [];
    continuousMonths.forEach(m => {
      const plist = (monthlyData[m] && monthlyData[m][ser]) || [];
      if (plist.length > 0) {
        const sum = plist.reduce((acc, v) => acc + v, 0);
        seriesPrices.push(Math.round(sum / plist.length));
      } else {
        seriesPrices.push(null);
      }
    });
    monthlyTrends.series[ser] = seriesPrices;
  });

  return {
    summary: summary,
    grouped_stats: groupedStats,
    monthly_trends: monthlyTrends
  };
}

// Load Data
async function loadData() {
  if (window.IPHONE_DATA) {
    rawData = window.IPHONE_DATA;
    initDataRange();
    setupDashboard();
    return;
  }

  try {
    const res = await fetch('../data/iphone_data.json');
    if (!res.ok) throw new Error('Network response not ok');
    rawData = await res.json();
    initDataRange();
    setupDashboard();
  } catch (err) {
    console.error('Failed to load iphone_data.json:', err);
    try {
      const res2 = await fetch('./data/iphone_data.json');
      rawData = await res2.json();
      initDataRange();
      setupDashboard();
    } catch (e) {
      document.body.innerHTML = `
        <div class="p-8 text-center text-rose-400">
          <h2 class="text-xl font-bold">資料載入失敗</h2>
          <p class="text-sm mt-2 text-slate-400">請確認 data/iphone_data.json 是否已生成，或使用 python run.py --serve 啟動伺服器。</p>
        </div>
      `;
    }
  }
}

function initDataRange() {
  if (rawData && rawData.items && rawData.items.length > 0) {
    const dates = rawData.items.map(it => it.date).filter(Boolean);
    if (dates.length > 0) {
      globalMinDate = dates.reduce((min, d) => d < min ? d : min, dates[0]);
      globalMaxDate = dates.reduce((max, d) => d > max ? d : max, dates[0]);
      currentDateRange.startDate = globalMinDate;
      currentDateRange.endDate = globalMaxDate;
    }
  }
  syncDateControls();
}

function setupDashboard() {
  renderCategoryControls();
  setupDatePresetListeners();
  updateCategoryView();
}

function setupDatePresetListeners() {
  document.querySelectorAll('#date-preset-buttons .date-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const p = btn.getAttribute('data-preset');
      if (p) {
        setDatePreset(p);
      }
    });
  });
}

function switchCategory(cat) {
  if (activeCategory === cat) return;
  activeCategory = cat;
  currentChartSeries = 'ALL';

  // Toggle Tab styles
  const tabIphone = document.getElementById('tab-iphone');
  const tabIpad = document.getElementById('tab-ipad');
  if (cat === 'iphone') {
    tabIphone.className = 'category-tab py-3.5 px-4 text-sm font-semibold border-b-2 border-sky-500 text-sky-400 flex items-center transition';
    tabIpad.className = 'category-tab py-3.5 px-4 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center transition';
  } else {
    tabIpad.className = 'category-tab py-3.5 px-4 text-sm font-semibold border-b-2 border-sky-500 text-sky-400 flex items-center transition';
    tabIphone.className = 'category-tab py-3.5 px-4 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center transition';
  }

  // Reset filter selections
  currentFilters = {
    series: 'ALL',
    model: 'ALL',
    capacity: 'ALL',
    status: 'ALL',
    keyword: ''
  };
  const kwEl = document.getElementById('filter-keyword');
  if (kwEl) kwEl.value = '';

  renderCategoryControls();
  updateCategoryView();
}

function updateCategoryView() {
  const catData = computeDynamicCategoryData(activeCategory, currentDateRange.startDate, currentDateRange.endDate);
  if (!catData) return;

  // Update Tab Counts for the current date range
  if (rawData && rawData.items) {
    const iphoneCount = rawData.items.filter(it => 
      it.device_type === 'iphone' &&
      (!currentDateRange.startDate || it.date >= currentDateRange.startDate) &&
      (!currentDateRange.endDate || it.date <= currentDateRange.endDate)
    ).length;
    const ipadCount = rawData.items.filter(it => 
      it.device_type === 'ipad_mini' &&
      (!currentDateRange.startDate || it.date >= currentDateRange.startDate) &&
      (!currentDateRange.endDate || it.date <= currentDateRange.endDate)
    ).length;

    const tabIphoneCount = document.getElementById('tab-iphone-count');
    const tabIpadCount = document.getElementById('tab-ipad-count');
    if (tabIphoneCount) tabIphoneCount.textContent = iphoneCount.toLocaleString();
    if (tabIpadCount) tabIpadCount.textContent = ipadCount.toLocaleString();
  }

  updateKPIs(catData.summary);
  renderSummaryTable(catData.grouped_stats);
  initValuationCalculator();
  initCharts(catData);
  applyFilters();
  initIcons();
}

function renderCategoryControls() {
  const badgesContainer = document.getElementById('series-badges');
  const modelSelect = document.getElementById('filter-model');
  const capSelect = document.getElementById('filter-capacity');
  const chartFilter = document.getElementById('chart-series-filter');

  if (activeCategory === 'iphone') {
    badgesContainer.innerHTML = `
      <button onclick="setSeriesFilter('ALL')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-sky-600 text-white transition" data-val="ALL">全部</button>
      <button onclick="setSeriesFilter('iPhone 18')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 18">i18</button>
      <button onclick="setSeriesFilter('iPhone 17')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 17">i17</button>
      <button onclick="setSeriesFilter('iPhone 16')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 16">i16</button>
      <button onclick="setSeriesFilter('iPhone 15')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 15">i15</button>
      <button onclick="setSeriesFilter('iPhone 14')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 14">i14</button>
      <button onclick="setSeriesFilter('iPhone 13')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPhone 13">i13</button>
    `;

    modelSelect.innerHTML = `
      <option value="ALL">全部子機型</option>
      <option value="Pro Max">Pro Max</option>
      <option value="Pro">Pro</option>
      <option value="Plus">Plus</option>
      <option value="標準版">標準版</option>
      <option value="mini">mini</option>
    `;

    capSelect.innerHTML = `
      <option value="ALL">全部容量</option>
      <option value="128G">128G</option>
      <option value="256G">256G</option>
      <option value="512G">512G</option>
      <option value="1TB">1TB</option>
      <option value="2TB">2TB</option>
    `;

    chartFilter.innerHTML = `
      <option value="ALL">全部系列</option>
      <option value="iPhone 18">iPhone 18</option>
      <option value="iPhone 17">iPhone 17</option>
      <option value="iPhone 16">iPhone 16</option>
      <option value="iPhone 15">iPhone 15</option>
      <option value="iPhone 14">iPhone 14</option>
      <option value="iPhone 13">iPhone 13</option>
    `;

    const gapFilter = document.getElementById('gap-spec-filter');
    if (gapFilter) {
      gapFilter.innerHTML = `
        <option value="BASE_128G" selected>標準版 128G (熱門基準)</option>
        <option value="OVERALL">全系列最新成交 (所有規格)</option>
        <option value="PRO_256G">Pro 256G (旗艦熱門)</option>
        <option value="PRO_MAX_256G">Pro Max 256G (頂級旗艦)</option>
        <option value="BASE_256G">標準版 256G</option>
        <option value="AVG">全系列世代均價</option>
      `;
      gapFilter.onchange = () => renderGenerationGapChart();
    }
    const gapTitle = document.getElementById('gap-chart-title');
    const gapSub = document.getElementById('gap-chart-sub');
    if (gapTitle) {
      gapTitle.innerHTML = `<i data-lucide="arrow-up-right" class="w-4 h-4 mr-2 text-purple-400"></i>iPhone 歷代最新成交價與世代價差`;
    }
    if (gapSub) {
      gapSub.textContent = `比較 i13 ~ i18 各代最新成交行情與升級價差`;
    }
  } else {
    // iPad mini
    badgesContainer.innerHTML = `
      <button onclick="setSeriesFilter('ALL')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-sky-600 text-white transition" data-val="ALL">全部</button>
      <button onclick="setSeriesFilter('iPad mini 7')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPad mini 7">iPad mini 7</button>
      <button onclick="setSeriesFilter('iPad mini 6')" class="badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition" data-val="iPad mini 6">iPad mini 6</button>
    `;

    modelSelect.innerHTML = `
      <option value="ALL">全部版本</option>
      <option value="WiFi">WiFi 版</option>
      <option value="Cellular">Cellular 行動網路版</option>
    `;

    capSelect.innerHTML = `
      <option value="ALL">全部容量</option>
      <option value="64G">64G</option>
      <option value="128G">128G</option>
      <option value="256G">256G</option>
      <option value="512G">512G</option>
    `;

    chartFilter.innerHTML = `
      <option value="ALL">全部版本</option>
      <option value="iPad mini 7">iPad mini 7</option>
      <option value="iPad mini 6">iPad mini 6</option>
    `;

    const gapFilter = document.getElementById('gap-spec-filter');
    if (gapFilter) {
      gapFilter.innerHTML = `
        <option value="WIFI_BASE" selected>WiFi 入門款 (64G/128G)</option>
        <option value="OVERALL">全版本最新成交</option>
        <option value="WIFI_256G">WiFi 大容量 (256G)</option>
        <option value="CELLULAR">Cellular 行動網路版</option>
        <option value="AVG">全版本世代均價</option>
      `;
      gapFilter.onchange = () => renderGenerationGapChart();
    }
    const gapTitle = document.getElementById('gap-chart-title');
    const gapSub = document.getElementById('gap-chart-sub');
    if (gapTitle) {
      gapTitle.innerHTML = `<i data-lucide="arrow-up-right" class="w-4 h-4 mr-2 text-purple-400"></i>iPad mini 歷代最新成交價與世代價差`;
    }
    if (gapSub) {
      gapSub.textContent = `比較 mini 6 vs mini 7 最新行情與升級價差`;
    }
  }
}

function updateKPIs(summary) {
  document.getElementById('kpi-total').textContent = summary.total_items.toLocaleString();
  document.getElementById('kpi-sold').textContent = summary.sold_count.toLocaleString();
  document.getElementById('kpi-sold-ratio').textContent = `${summary.sold_ratio}%`;
  document.getElementById('kpi-active').textContent = summary.active_count.toLocaleString();
  const resCount = (summary.reserved_count || 0) + (summary.pending_count || 0);
  document.getElementById('kpi-reserved').textContent = `${resCount} 篇暫售/保留`;
  
  const dateRangeEl = document.getElementById('kpi-date-range');
  const subtextEl = document.getElementById('kpi-date-subtext');
  if (dateRangeEl) {
    dateRangeEl.textContent = `${currentDateRange.startDate} ~ ${currentDateRange.endDate}`;
  }
  if (subtextEl) {
    if (summary.total_items > 0) {
      subtextEl.textContent = `涵蓋 ${summary.total_items.toLocaleString()} 篇 (文章分佈 ${summary.earliest_date} ~ ${summary.latest_date})`;
    } else {
      subtextEl.textContent = `所選時間區間內查無文章資料`;
    }
  }

  if (summary.updated_at) {
    const updateEl = document.getElementById('updated-at');
    if (updateEl) updateEl.textContent = `更新於 ${summary.updated_at}`;
  }
}

let currentSummaryStats = [];
let summarySortField = 'default';
let summarySortOrder = 'desc';

function toggleSummarySort(field) {
  if (summarySortField === field) {
    summarySortOrder = summarySortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    summarySortField = field;
    summarySortOrder = 'desc';
  }
  updateSummarySortIcons();
  renderSummaryTable(currentSummaryStats, false);
}

function updateSummarySortIcons() {
  const fields = ['model', 'capacity', 'total_count', 'sold_ratio', 'sold_min', 'sold_max', 'latest_sold', 'latest_active', 'price_diff'];
  fields.forEach(f => {
    const el = document.getElementById(`sort-icon-${f}`);
    if (!el) return;
    if (summarySortField === f) {
      el.textContent = summarySortOrder === 'asc' ? '▲' : '▼';
      el.className = 'text-sky-400 font-bold';
    } else {
      el.textContent = '↕';
      el.className = 'text-slate-500';
    }
  });
}

// Render Summary Table
function renderSummaryTable(stats, updateCache = true) {
  const tbody = document.getElementById('summary-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (updateCache && stats) {
    currentSummaryStats = [...stats];
  }

  // Populate modelMedianMap for valuation & bargain detection
  window.modelMedianMap = {};
  currentSummaryStats.forEach(st => {
    if (st.sold_stats && st.sold_stats.median) {
      window.modelMedianMap[`${st.model}_${st.capacity}`] = st.sold_stats.median;
    }
  });

  if (!currentSummaryStats || currentSummaryStats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-500">尚無行情資料</td></tr>`;
    return;
  }

  let displayStats = [...currentSummaryStats];
  if (summarySortField !== 'default') {
    displayStats.sort((a, b) => {
      if (summarySortField === 'model') {
        return summarySortOrder === 'asc' ? a.model.localeCompare(b.model) : b.model.localeCompare(a.model);
      }
      if (summarySortField === 'capacity') {
        const capOrder = ['64G', '128G', '256G', '512G', '1TB', '2TB'];
        const iA = capOrder.indexOf(a.capacity);
        const iB = capOrder.indexOf(b.capacity);
        return summarySortOrder === 'asc' ? iA - iB : iB - iA;
      }
      let vA = 0, vB = 0;
      if (summarySortField === 'total_count') {
        vA = a.total_count || 0; vB = b.total_count || 0;
      } else if (summarySortField === 'sold_ratio') {
        vA = a.sold_ratio || 0; vB = b.sold_ratio || 0;
      } else if (summarySortField === 'sold_min') {
        vA = a.sold_stats?.min || 0; vB = b.sold_stats?.min || 0;
      } else if (summarySortField === 'sold_max') {
        vA = a.sold_stats?.max || 0; vB = b.sold_stats?.max || 0;
      } else if (summarySortField === 'latest_sold') {
        vA = a.latest_sold?.price || a.sold_stats?.median || 0;
        vB = b.latest_sold?.price || b.sold_stats?.median || 0;
      } else if (summarySortField === 'latest_active') {
        vA = a.latest_active?.price || a.active_stats?.median || 0;
        vB = b.latest_active?.price || b.active_stats?.median || 0;
      } else if (summarySortField === 'price_diff') {
        vA = (a.latest_active?.price && a.latest_sold?.price) ? (a.latest_active.price - a.latest_sold.price) : (a.price_diff || 0);
        vB = (b.latest_active?.price && b.latest_sold?.price) ? (b.latest_active.price - b.latest_sold.price) : (b.price_diff || 0);
      }
      return summarySortOrder === 'asc' ? vA - vB : vB - vA;
    });
  }

  displayStats.forEach(st => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/50 transition cursor-pointer';
    tr.setAttribute('data-series', st.series);
    tr.setAttribute('data-model', st.model);
    tr.setAttribute('data-capacity', st.capacity);

    tr.onclick = () => {
      // 1. Highlight clicked row in summary table
      document.querySelectorAll('#summary-tbody tr').forEach(r => {
        r.classList.remove('bg-sky-950/60', 'border-l-4', 'border-sky-400');
      });
      tr.classList.add('bg-sky-950/60', 'border-l-4', 'border-sky-400');

      // 2. Set series filter badge (don't auto-apply yet)
      setSeriesFilter(st.series, false);

      // 3. Set submodel dropdown based on st.model
      let submodel = 'ALL';
      if (activeCategory === 'iphone') {
        if (st.model.includes('Pro Max')) submodel = 'Pro Max';
        else if (st.model.includes('Pro')) submodel = 'Pro';
        else if (st.model.includes('Plus')) submodel = 'Plus';
        else if (st.model.includes('mini')) submodel = 'mini';
        else submodel = '標準版';
      } else {
        if (st.model.includes('Cellular')) submodel = 'Cellular';
        else if (st.model.includes('WiFi')) submodel = 'WiFi';
      }
      const modelSelect = document.getElementById('filter-model');
      if (modelSelect) {
        modelSelect.value = submodel;
      }

      // 4. Set capacity dropdown
      const capSelect = document.getElementById('filter-capacity');
      if (capSelect) {
        capSelect.value = st.capacity;
      }

      // 5. Apply filters
      applyFilters();

      // 6. Smooth scroll to articles section
      const sec = document.getElementById('articles-section');
      if (sec) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const soldMin = st.sold_stats.min ? `NT$ ${st.sold_stats.min.toLocaleString()}` : '-';
    const soldMax = st.sold_stats.max ? `NT$ ${st.sold_stats.max.toLocaleString()}` : '-';

    let latestSoldHtml = '-';
    if (st.latest_sold && st.latest_sold.price) {
      latestSoldHtml = `
        <span class="font-bold text-emerald-400">NT$ ${st.latest_sold.price.toLocaleString()}</span>
        <span class="text-[10px] text-slate-400 block font-mono">${st.latest_sold.date || ''}</span>
      `;
    } else if (st.sold_stats && st.sold_stats.median) {
      latestSoldHtml = `<span class="font-bold text-emerald-400">NT$ ${st.sold_stats.median.toLocaleString()}</span>`;
    }

    let latestActiveHtml = '-';
    if (st.latest_active && st.latest_active.price) {
      latestActiveHtml = `
        <span class="font-bold text-sky-400">NT$ ${st.latest_active.price.toLocaleString()}</span>
        <span class="text-[10px] text-slate-400 block font-mono">${st.latest_active.date || ''}</span>
      `;
    } else if (st.active_stats && st.active_stats.median) {
      latestActiveHtml = `<span class="font-bold text-sky-400">NT$ ${st.active_stats.median.toLocaleString()}</span>`;
    }

    let diffHtml = '-';
    let diffVal = null;
    if (st.latest_active && st.latest_sold) {
      diffVal = st.latest_active.price - st.latest_sold.price;
    } else if (st.price_diff !== null && st.price_diff !== undefined) {
      diffVal = st.price_diff;
    }

    if (diffVal !== null) {
      if (diffVal > 0) {
        diffHtml = `<span class="text-amber-400 font-medium">+${diffVal.toLocaleString()} (開高)</span>`;
      } else if (diffVal < 0) {
        diffHtml = `<span class="text-emerald-400 font-medium">${diffVal.toLocaleString()}</span>`;
      } else {
        diffHtml = `<span class="text-slate-400">持平</span>`;
      }
    }

    tr.innerHTML = `
      <td class="py-3 px-4 font-semibold text-slate-200">${st.model}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">${st.capacity}</span></td>
      <td class="py-3 px-4 text-center text-slate-300 font-mono">${st.total_count}</td>
      <td class="py-3 px-4 text-center">
        <span class="text-emerald-400 font-medium">${st.sold_count}</span>
        <span class="text-slate-500 text-[10px] block">(${st.sold_ratio}%)</span>
      </td>
      <td class="py-3 px-4 font-mono text-emerald-400/90">${soldMin}</td>
      <td class="py-3 px-4 font-mono text-emerald-400/90">${soldMax}</td>
      <td class="py-3 px-4 font-mono">${latestSoldHtml}</td>
      <td class="py-3 px-4 font-mono">${latestActiveHtml}</td>
      <td class="py-3 px-4 font-mono">${diffHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Valuation Calculator Logic
function initValuationCalculator() {
  const modelSelect = document.getElementById('calc-model');
  if (!modelSelect || !rawData || !rawData.items) return;

  const currentCatData = computeDynamicCategoryData(activeCategory, currentDateRange.startDate, currentDateRange.endDate);
  if (!currentCatData || !currentCatData.grouped_stats) return;

  const models = [...new Set(currentCatData.grouped_stats.map(s => s.model))];
  if (models.length === 0) return;

  const prevModel = modelSelect.value;
  modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
  if (prevModel && models.includes(prevModel)) {
    modelSelect.value = prevModel;
  }
  onCalcModelChange();
}

function onCalcModelChange() {
  const modelSelect = document.getElementById('calc-model');
  const capSelect = document.getElementById('calc-capacity');
  if (!modelSelect || !capSelect) return;

  const currentCatData = computeDynamicCategoryData(activeCategory, currentDateRange.startDate, currentDateRange.endDate);
  if (!currentCatData) return;

  const selectedModel = modelSelect.value;
  const capacities = currentCatData.grouped_stats
    .filter(s => s.model === selectedModel)
    .map(s => s.capacity);

  const capOrder = ['64G', '128G', '256G', '512G', '1TB', '2TB'];
  capacities.sort((a, b) => (capOrder.indexOf(a) >= 0 ? capOrder.indexOf(a) : 99) - (capOrder.indexOf(b) >= 0 ? capOrder.indexOf(b) : 99));

  const prevCap = capSelect.value;
  capSelect.innerHTML = capacities.map(c => `<option value="${c}">${c}</option>`).join('');
  if (prevCap && capacities.includes(prevCap)) {
    capSelect.value = prevCap;
  }
  calculateValuation();
}

function onCalcBatteryInput(val) {
  const label = document.getElementById('calc-battery-val');
  const hint = document.getElementById('calc-battery-hint');
  if (label) label.textContent = `${val}%`;
  if (hint) {
    const v = parseInt(val);
    if (v >= 95) hint.textContent = '⚡ 95%+ 原廠充沛溢價 (+NT$ 800)';
    else if (v >= 90) hint.textContent = '✨ 90%~94% 電池優良 (+NT$ 400)';
    else if (v >= 85) hint.textContent = '85%~89% 正常使用基準';
    else if (v >= 80) hint.textContent = '80%~84% 輕微老化折讓 (-NT$ 500)';
    else hint.textContent = '⚠️ < 80% 需更換電池折讓 (-NT$ 2,800)';
  }
  calculateValuation();
}

function calculateValuation() {
  const modelEl = document.getElementById('calc-model');
  const capEl = document.getElementById('calc-capacity');
  const battEl = document.getElementById('calc-battery');
  const warrEl = document.getElementById('calc-warranty');
  if (!modelEl || !capEl || !battEl || !warrEl) return;

  const model = modelEl.value;
  const capacity = capEl.value;
  const battery = parseInt(battEl.value) || 85;
  const warranty = warrEl.value;

  const currentCatData = computeDynamicCategoryData(activeCategory, currentDateRange.startDate, currentDateRange.endDate);
  if (!currentCatData || !currentCatData.grouped_stats) return;

  const stat = currentCatData.grouped_stats.find(s => s.model === model && s.capacity === capacity);
  const quickEl = document.getElementById('calc-price-quick');
  const fairEl = document.getElementById('calc-price-fair');
  const rangeEl = document.getElementById('calc-price-range');
  const premiumEl = document.getElementById('calc-price-premium');
  const noteEl = document.getElementById('calc-adjustment-note');
  const quickNoteEl = document.getElementById('calc-quick-note');
  const samplesEl = document.getElementById('calc-recent-samples');

  if (!stat || !stat.sold_stats || stat.sold_stats.count === 0 || (!stat.sold_stats.mode && !stat.sold_stats.median)) {
    if (quickEl) quickEl.textContent = '無足夠資料';
    if (fairEl) fairEl.textContent = '無已成交樣本';
    if (rangeEl) rangeEl.textContent = '--';
    if (premiumEl) premiumEl.textContent = '無足夠資料';
    if (noteEl) noteEl.textContent = '所選時間區間內尚無已成交數據以供精確推算';
    if (quickNoteEl) quickNoteEl.textContent = '所選時間區間內無成交紀錄';
    if (samplesEl) samplesEl.innerHTML = '<span class="text-slate-500">尚無近期成交案例</span>';
    return;
  }

  // 1. 市場行情價基準：使用選取時間的成交眾數 (Mode)
  const baseMode = stat.sold_stats.mode || stat.sold_stats.median || stat.sold_stats.avg;

  // 2. 秒殺出清價基準：使用最低 10 筆的平均 (Lowest 10 Average)
  const lowest10Count = Math.min(10, stat.sold_stats.count);
  const baseLowest10 = stat.sold_stats.lowest10_avg || Math.round(baseMode * 0.90);

  // Battery adjustment
  let adjBatt = 0;
  if (battery >= 95) adjBatt = 800;
  else if (battery >= 90) adjBatt = 400;
  else if (battery >= 85) adjBatt = 0;
  else if (battery >= 80) adjBatt = -500;
  else adjBatt = -2800;

  // Warranty adjustment
  let adjWarr = 0;
  const wHint = document.getElementById('calc-warranty-hint');
  if (warranty === 'WARRANTY') {
    adjWarr = 1500;
    if (wHint) wHint.textContent = '原廠保內溢價約 +$1,500';
  } else if (warranty === 'APPLECARE') {
    adjWarr = 2500;
    if (wHint) wHint.textContent = 'AppleCare+ 意外保險溢價約 +$2,500';
  } else if (warranty === 'NEW_UNOPENED') {
    adjWarr = 3500;
    if (wHint) wHint.textContent = '全新未拆封溢價約 +$3,500';
  } else {
    adjWarr = 0;
    if (wHint) wHint.textContent = '過保標準基準價';
  }

  // 市場行情價 (以眾數為基準 + 電池與保固微調)
  const fairPrice = Math.max(3000, Math.round((baseMode + adjBatt + adjWarr) / 100) * 100);

  // 秒殺出清價 (以最低 10 筆均價為基準 + 電池與保固微調)
  let quickPrice = Math.max(2500, Math.round((baseLowest10 + adjBatt + adjWarr) / 100) * 100);
  if (quickPrice > fairPrice) {
    quickPrice = fairPrice;
  }

  // 精品保值價與合理波動區間
  const premiumPrice = Math.round((fairPrice * 1.08) / 100) * 100;
  const rangeLow = Math.round((fairPrice * 0.97) / 100) * 100;
  const rangeHigh = Math.round((fairPrice * 1.03) / 100) * 100;

  if (quickEl) quickEl.textContent = `NT$ ${quickPrice.toLocaleString()}`;
  if (fairEl) fairEl.textContent = `NT$ ${fairPrice.toLocaleString()}`;
  if (rangeEl) rangeEl.textContent = `NT$ ${rangeLow.toLocaleString()} ~ ${rangeHigh.toLocaleString()}`;
  if (premiumEl) premiumEl.textContent = `NT$ ${premiumPrice.toLocaleString()}`;

  const battSign = adjBatt >= 0 ? `+NT$${adjBatt}` : `-NT$${Math.abs(adjBatt)}`;
  const warrSign = adjWarr > 0 ? `+NT$${adjWarr}` : '';
  const noteParts = [`成交眾數基準 NT$ ${baseMode.toLocaleString()}`];
  if (adjBatt !== 0) noteParts.push(`電池 (${battery}%): ${battSign}`);
  if (adjWarr > 0) noteParts.push(`保固: ${warrSign}`);
  if (noteEl) noteEl.textContent = noteParts.join(' ｜ ');

  if (quickNoteEl) {
    quickNoteEl.textContent = `取選取區間最低 ${lowest10Count} 筆成交均價 (NT$ ${baseLowest10.toLocaleString()}) 計算`;
  }

  // Fetch recent sold samples for this model & capacity in selected date range
  if (samplesEl && rawData && rawData.items) {
    let recentSold = rawData.items
      .filter(it => 
        it.status === '已售出' && 
        it.model === model && 
        it.capacity === capacity && 
        it.price &&
        (!currentDateRange.startDate || it.date >= currentDateRange.startDate) &&
        (!currentDateRange.endDate || it.date <= currentDateRange.endDate)
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3);

    if (recentSold.length === 0) {
      recentSold = rawData.items
        .filter(it => it.status === '已售出' && it.model === model && it.capacity === capacity && it.price)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 3);
    }

    if (recentSold.length > 0) {
      let samplesHtml = `<span class="text-slate-400 font-medium">📋 近期成交案例：</span><div class="flex flex-wrap items-center gap-2">`;
      recentSold.forEach(s => {
        samplesHtml += `
          <a href="${s.url}" target="_blank" class="px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-sky-300 border border-slate-700/70 transition flex items-center gap-1.5">
            <span class="text-emerald-400 font-mono font-bold">NT$ ${s.price.toLocaleString()}</span>
            <span class="text-slate-400 text-[10px]">${s.date}</span>
            <span class="text-purple-300 text-[10px]">${s.battery ? s.battery + '%' : ''}</span>
          </a>
        `;
      });
      samplesHtml += `</div>`;
      samplesEl.innerHTML = samplesHtml;
    } else {
      samplesEl.innerHTML = '<span class="text-slate-500">尚無近期個案</span>';
    }
  }
}

function applyCalculatorToFilters() {
  const modelEl = document.getElementById('calc-model');
  const capEl = document.getElementById('calc-capacity');
  if (!modelEl || !capEl) return;

  const modelVal = modelEl.value;
  const capVal = capEl.value;

  let submodel = 'ALL';
  if (activeCategory === 'iphone') {
    if (modelVal.includes('Pro Max')) submodel = 'Pro Max';
    else if (modelVal.includes('Pro')) submodel = 'Pro';
    else if (modelVal.includes('Plus')) submodel = 'Plus';
    else if (modelVal.includes('mini')) submodel = 'mini';
    else submodel = '標準版';
  } else {
    if (modelVal.includes('Cellular')) submodel = 'Cellular';
    else if (modelVal.includes('WiFi')) submodel = 'WiFi';
  }

  const modelSelect = document.getElementById('filter-model');
  const capSelect = document.getElementById('filter-capacity');
  if (modelSelect) modelSelect.value = submodel;
  if (capSelect) capSelect.value = capVal;

  applyFilters();

  const sec = document.getElementById('articles-section');
  if (sec) {
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

let onlyBargain = false;

function toggleBargainFilter() {
  onlyBargain = !onlyBargain;
  const btn = document.getElementById('btn-toggle-bargain');
  const text = document.getElementById('bargain-btn-text');
  if (btn) {
    if (onlyBargain) {
      btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-400 bg-emerald-500/30 text-emerald-200 shadow-lg shadow-emerald-950/50 text-xs font-bold transition';
      if (text) text.textContent = '🔥 只看超值撿漏好康 (啟用中)';
    } else {
      btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold transition';
      if (text) text.textContent = '🔥 只看超值撿漏好康 (低於行情)';
    }
  }
  applyFilters();
}

// Charts
function initCharts(catData) {
  const filterEl = document.getElementById('chart-series-filter');
  if (filterEl) {
    filterEl.value = currentChartSeries;
  }
  const filtered = (!filterEl || currentChartSeries === 'ALL') 
    ? catData.grouped_stats 
    : catData.grouped_stats.filter(s => s.series === currentChartSeries);

  renderPriceRangeChart(filtered);
  renderTrendChart(catData.monthly_trends);
  renderGenerationGapChart();

  if (filterEl) {
    filterEl.onchange = (e) => {
      currentChartSeries = e.target.value;
      const val = e.target.value;
      const f = val === 'ALL' ? catData.grouped_stats : catData.grouped_stats.filter(s => s.series === val);
      renderPriceRangeChart(f);
    };
  }
}

function renderPriceRangeChart(stats) {
  const ctx = document.getElementById('priceRangeChart').getContext('2d');
  if (priceChart) priceChart.destroy();

  const SERIES_ORDER = [
    'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone 17', 'iPhone 18',
    'iPad mini 6', 'iPad mini 7'
  ];
  const CAPACITY_ORDER = ['64G', '128G', '256G', '512G', '1TB', '2TB'];

  function getSubmodelTier(modelName) {
    if (modelName.includes('mini') && !modelName.includes('iPad')) return 0;
    if (modelName.includes('Pro Max')) return 4;
    if (modelName.includes('Pro') && !modelName.includes('iPad')) return 3;
    if (modelName.includes('Plus')) return 2;
    if (modelName.includes('WiFi')) return 0;
    if (modelName.includes('Cellular')) return 1;
    return 1; // Standard base model
  }

  function compareModelsOldToNewLowToHigh(a, b) {
    // 1. Series: Oldest to Newest (i13 -> i14 -> i15 -> i16 -> i17 -> i18)
    const sIdxA = SERIES_ORDER.indexOf(a.series);
    const sIdxB = SERIES_ORDER.indexOf(b.series);
    const sDiff = (sIdxA >= 0 ? sIdxA : 99) - (sIdxB >= 0 ? sIdxB : 99);
    if (sDiff !== 0) return sDiff;

    // 2. Tier: Lowest to Highest (mini -> base -> Plus -> Pro -> Pro Max)
    const tierA = getSubmodelTier(a.model);
    const tierB = getSubmodelTier(b.model);
    if (tierA !== tierB) return tierA - tierB;

    // 3. Capacity: Smallest to Largest (64G -> 128G -> 256G -> 512G -> 1TB -> 2TB)
    const cIdxA = CAPACITY_ORDER.indexOf(a.capacity);
    const cIdxB = CAPACITY_ORDER.indexOf(b.capacity);
    return (cIdxA >= 0 ? cIdxA : 99) - (cIdxB >= 0 ? cIdxB : 99);
  }

  // Filter models that have at least 1 sold item
  const validStats = stats.filter(s => s.sold_stats && s.sold_stats.count > 0);

  // Check if a single series is selected or ALL
  const filterDropdown = document.getElementById('chart-series-filter');
  const currentChartSeries = filterDropdown ? filterDropdown.value : 'ALL';

  let topStats = [];
  if (currentChartSeries !== 'ALL' || activeCategory === 'ipad_mini') {
    // Show all valid models of the selected series/category, ordered by Tier & Capacity
    topStats = [...validStats].sort(compareModelsOldToNewLowToHigh);
  } else {
    // For ALL iPhone series: select top 3 most popular models per generation, then sort Oldest->Newest and Low->High
    const bySeries = {};
    validStats.forEach(s => {
      bySeries[s.series] = bySeries[s.series] || [];
      bySeries[s.series].push(s);
    });

    const selected = [];
    SERIES_ORDER.slice(0, 6).forEach(ser => {
      const serModels = bySeries[ser] || [];
      const topForSer = [...serModels].sort((a, b) => b.total_count - a.total_count).slice(0, 3);
      selected.push(...topForSer);
    });

    topStats = selected.sort(compareModelsOldToNewLowToHigh);
  }

  if (topStats.length === 0) {
    if (priceChart) {
      priceChart.destroy();
      priceChart = null;
    }
    const canvas = document.getElementById('priceRangeChart');
    if (canvas) {
      const c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.save();
      c.fillStyle = '#94a3b8';
      c.font = '13px Inter, sans-serif';
      c.textAlign = 'center';
      c.fillText('所選時間區間內尚無成交行情數據', canvas.width / 2, canvas.height / 2);
      c.restore();
    }
    return;
  }
  const labels = topStats.map(s => `${s.model.replace('iPhone ', 'i').replace('iPad mini ', 'mini ')} ${s.capacity}`);

  // Floating bar body data: [p25, p75]
  const candleBodies = topStats.map(s => {
    let low = s.sold_stats.p25 || s.sold_stats.min || 0;
    let high = s.sold_stats.p75 || s.sold_stats.max || 0;
    if (low === high) {
      low = Math.max(0, low - 60);
      high = high + 60;
    }
    return [low, high];
  });

  const bgColors = topStats.map(() => 'rgba(16, 185, 129, 0.45)');
  const borderColors = topStats.map(() => '#10b981');

  // Compute scale boundaries
  let globalMin = Infinity;
  let globalMax = -Infinity;
  topStats.forEach(s => {
    if (s.sold_stats.min > 0) globalMin = Math.min(globalMin, s.sold_stats.min);
    if (s.sold_stats.max > 0) globalMax = Math.max(globalMax, s.sold_stats.max);
    if (s.active_stats && s.active_stats.median > 0) {
      globalMin = Math.min(globalMin, s.active_stats.median);
      globalMax = Math.max(globalMax, s.active_stats.median);
    }
  });
  if (globalMin === Infinity) globalMin = 5000;
  if (globalMax === -Infinity) globalMax = 50000;

  const yAxisMin = Math.max(0, Math.floor((globalMin * 0.9) / 1000) * 1000);
  const yAxisMax = Math.ceil((globalMax * 1.08) / 1000) * 1000;

  // Custom Candlestick Shadows, Median Line & Asking Price Indicator Plugin
  const candlestickPlugin = {
    id: 'candlestickCustomWicks',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { y } } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      meta.data.forEach((bar, index) => {
        const stat = topStats[index];
        if (!stat || !stat.sold_stats || stat.sold_stats.count === 0) return;

        const s = stat.sold_stats;
        const xCenter = bar.x;
        const barWidth = Math.min(Math.max(bar.width, 18), 38);

        const yMax = y.getPixelForValue(s.max);
        const yMin = y.getPixelForValue(s.min);
        const yP75 = y.getPixelForValue(s.p75 || s.max);
        const yP25 = y.getPixelForValue(s.p25 || s.min);
        const yMed = y.getPixelForValue(s.median);

        ctx.save();

        // 1. Upper Wick (Shadow from Max to P75)
        ctx.beginPath();
        ctx.strokeStyle = '#34d399'; // Emerald-400
        ctx.lineWidth = 2;
        ctx.moveTo(xCenter, yMax);
        ctx.lineTo(xCenter, Math.min(yP75, yP25));
        ctx.stroke();

        // Upper Cap Tick (Horizontal bar at Max)
        ctx.beginPath();
        ctx.moveTo(xCenter - 5, yMax);
        ctx.lineTo(xCenter + 5, yMax);
        ctx.stroke();

        // 2. Lower Wick (Shadow from Min to P25)
        ctx.beginPath();
        ctx.strokeStyle = '#34d399'; // Emerald-400
        ctx.lineWidth = 2;
        ctx.moveTo(xCenter, yMin);
        ctx.lineTo(xCenter, Math.max(yP75, yP25));
        ctx.stroke();

        // Lower Cap Tick (Horizontal bar at Min)
        ctx.beginPath();
        ctx.moveTo(xCenter - 5, yMin);
        ctx.lineTo(xCenter + 5, yMin);
        ctx.stroke();

        // 3. Median Line inside the candle (Bright White Bold Line)
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.moveTo(xCenter - (barWidth / 2) + 1, yMed);
        ctx.lineTo(xCenter + (barWidth / 2) - 1, yMed);
        ctx.stroke();

        // 4. Active Asking Price Median (Sky Blue Diamond Indicator)
        if (stat.active_stats && stat.active_stats.median > 0) {
          const yActive = y.getPixelForValue(stat.active_stats.median);
          ctx.fillStyle = '#38bdf8'; // Sky-400
          ctx.strokeStyle = '#0f172a'; // Dark slate outline
          ctx.lineWidth = 1.5;
          const r = 5;
          ctx.beginPath();
          ctx.arc(xCenter, yActive, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      });
    }
  };

  priceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '核心成交區間 (25%~75%)',
          data: candleBodies,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 3,
          barPercentage: 0.55,
          categoryPercentage: 0.8
        }
      ]
    },
    plugins: [candlestickPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: false // Use custom header legend
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          titleFont: { size: 13, weight: 'bold' },
          bodyColor: '#cbd5e1',
          bodyFont: { size: 12 },
          borderColor: 'rgba(56, 189, 248, 0.4)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              const stat = topStats[items[0].dataIndex];
              return `${stat.model} ${stat.capacity}`;
            },
            label: (item) => {
              const stat = topStats[item.dataIndex];
              const s = stat.sold_stats;
              const a = stat.active_stats;
              const diffStr = stat.price_diff !== null && stat.price_diff !== undefined ? 
                (stat.price_diff > 0 ? `+${stat.price_diff.toLocaleString()} (開高)` : `${stat.price_diff.toLocaleString()}`) : '持平';

              return [
                `已成交: ${stat.sold_count} 篇 (${stat.sold_ratio}% 成交率) / 掛售中: ${a.count || 0} 篇`,
                `────────────────────────────────`,
                `🔺 最高成交價 (Max): NT$ ${s.max ? s.max.toLocaleString() : '-'}`,
                `🟩 75% 成交分位 (P75): NT$ ${s.p75 ? s.p75.toLocaleString() : '-'}`,
                `⭐️ 成交中位數 (Median): NT$ ${s.median ? s.median.toLocaleString() : '-'}`,
                `🟩 25% 成交分位 (P25): NT$ ${s.p25 ? s.p25.toLocaleString() : '-'}`,
                `🔻 最低成交價 (Min): NT$ ${s.min ? s.min.toLocaleString() : '-'}`,
                `────────────────────────────────`,
                `🔵 掛售中位數 (Asking): NT$ ${a.median ? a.median.toLocaleString() : '-'}`,
                `📊 價差折讓: NT$ ${diffStr}`
              ];
            }
          }
        }
      },
      onClick: (e, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const stat = topStats[idx];
          if (stat) {
            setSeriesFilter(stat.series, false);
            let submodel = 'ALL';
            if (activeCategory === 'iphone') {
              if (stat.model.includes('Pro Max')) submodel = 'Pro Max';
              else if (stat.model.includes('Pro')) submodel = 'Pro';
              else if (stat.model.includes('Plus')) submodel = 'Plus';
              else if (stat.model.includes('mini')) submodel = 'mini';
              else submodel = '標準版';
            } else {
              if (stat.model.includes('Cellular')) submodel = 'Cellular';
              else if (stat.model.includes('WiFi')) submodel = 'WiFi';
            }
            const modelSelect = document.getElementById('filter-model');
            if (modelSelect) modelSelect.value = submodel;
            const capSelect = document.getElementById('filter-capacity');
            if (capSelect) capSelect.value = stat.capacity;
            applyFilters();
            const sec = document.getElementById('articles-section');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(51, 65, 85, 0.2)' }
        },
        y: {
          min: yAxisMin,
          max: yAxisMax,
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: (v) => `$${(v / 1000).toFixed(0)}k`
          },
          grid: { color: 'rgba(51, 65, 85, 0.3)' }
        }
      }
    }
  });
}

function renderTrendChart(trends) {
  const titleEl = document.getElementById('trend-chart-title');
  const subEl = document.getElementById('trend-chart-sub');
  if (titleEl) {
    if (currentDateRange.preset === 'all') {
      titleEl.innerHTML = `<i data-lucide="trending-up" class="w-4 h-4 mr-2 text-emerald-400"></i>近 2 年月度成交均價走勢 (2024 ~ 2026 折舊軌跡)`;
      if (subEl) subEl.textContent = '月度平均成交價 (NT$) 歷史折舊走勢';
    } else {
      titleEl.innerHTML = `<i data-lucide="trending-up" class="w-4 h-4 mr-2 text-emerald-400"></i>月度成交均價走勢 (${currentDateRange.startDate.slice(0, 7)} ~ ${currentDateRange.endDate.slice(0, 7)})`;
      if (subEl) subEl.textContent = `統計 ${currentDateRange.startDate} ~ ${currentDateRange.endDate} 期間之月度平均成交價折舊軌跡`;
    }
  }

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  const colors = {
    'iPhone 18': '#f43f5e',
    'iPhone 17': '#fb923c',
    'iPhone 16': '#38bdf8',
    'iPhone 15': '#818cf8',
    'iPhone 14': '#a78bfa',
    'iPhone 13': '#4ade80',
    'iPad mini 7': '#38bdf8',
    'iPad mini 6': '#fb923c'
  };

  const datasets = [];
  if (trends && trends.series) {
    for (const [ser, prices] of Object.entries(trends.series)) {
      if (prices.some(p => p !== null)) {
        datasets.push({
          label: ser,
          data: prices,
          borderColor: colors[ser] || '#cbd5e1',
          backgroundColor: colors[ser] || '#cbd5e1',
          tension: 0.3,
          pointRadius: 4,
          spanGaps: true
        });
      }
    }
  }

  if (!trends || !trends.months || trends.months.length === 0 || datasets.length === 0) {
    const canvas = document.getElementById('trendChart');
    if (canvas) {
      const c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.save();
      c.fillStyle = '#94a3b8';
      c.font = '13px Inter, sans-serif';
      c.textAlign = 'center';
      c.fillText('所選時間區間內尚無足夠的歷史月度成交均價', canvas.width / 2, canvas.height / 2);
      c.restore();
    }
    return;
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trends.months,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: NT$ ${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : '無成交'}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { color: 'rgba(51, 65, 85, 0.3)' }
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (v) => `$${(v / 1000).toFixed(0)}k`
          },
          grid: { color: 'rgba(51, 65, 85, 0.3)' }
        }
      }
    }
  });
}

function renderGenerationGapChart() {
  const canvas = document.getElementById('generationGapChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const summaryEl = document.getElementById('gap-summary-cards');

  if (gapChart) {
    gapChart.destroy();
    gapChart = null;
  }

  const isIphone = activeCategory === 'iphone';
  const seriesList = isIphone
    ? ['iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone 17', 'iPhone 18']
    : ['iPad mini 6', 'iPad mini 7'];

  const shortLabels = {
    'iPhone 13': 'i13',
    'iPhone 14': 'i14',
    'iPhone 15': 'i15',
    'iPhone 16': 'i16',
    'iPhone 17': 'i17',
    'iPhone 18': 'i18',
    'iPad mini 6': 'mini 6',
    'iPad mini 7': 'mini 7'
  };

  const seriesColors = {
    'iPhone 13': '#4ade80',
    'iPhone 14': '#a78bfa',
    'iPhone 15': '#818cf8',
    'iPhone 16': '#38bdf8',
    'iPhone 17': '#fb923c',
    'iPhone 18': '#f43f5e',
    'iPad mini 6': '#fb923c',
    'iPad mini 7': '#38bdf8'
  };

  const specFilter = document.getElementById('gap-spec-filter')?.value || (isIphone ? 'BASE_128G' : 'WIFI_BASE');

  // Filter items in selected date range with status '已售出'
  const allSold = (rawData && rawData.items ? rawData.items : []).filter(it => {
    if (it.status !== '已售出') return false;
    if (!it.price || it.price < 3000) return false;
    if (currentDateRange.startDate && it.date < currentDateRange.startDate) return false;
    if (currentDateRange.endDate && it.date > currentDateRange.endDate) return false;
    return true;
  });

  const points = [];

  seriesList.forEach(ser => {
    let matching = [];

    if (isIphone) {
      if (specFilter === 'BASE_128G') {
        matching = allSold.filter(it => it.series === ser && it.capacity === '128G' && (it.model === ser || it.model.endsWith('標準版')));
      } else if (specFilter === 'BASE_256G') {
        matching = allSold.filter(it => it.series === ser && it.capacity === '256G' && (it.model === ser || it.model.endsWith('標準版')));
      } else if (specFilter === 'PRO_256G') {
        matching = allSold.filter(it => it.series === ser && it.capacity === '256G' && it.model === `${ser} Pro`);
      } else if (specFilter === 'PRO_MAX_256G') {
        matching = allSold.filter(it => it.series === ser && it.capacity === '256G' && it.model === `${ser} Pro Max`);
      } else {
        // OVERALL or AVG
        matching = allSold.filter(it => it.series === ser);
      }
    } else {
      // iPad mini
      if (specFilter === 'WIFI_BASE') {
        matching = allSold.filter(it => it.series === ser && it.model.includes('WiFi') && (it.capacity === '64G' || it.capacity === '128G'));
      } else if (specFilter === 'WIFI_256G') {
        matching = allSold.filter(it => it.series === ser && it.model.includes('WiFi') && it.capacity === '256G');
      } else if (specFilter === 'CELLULAR') {
        matching = allSold.filter(it => it.series === ser && it.model.includes('Cellular'));
      } else {
        // OVERALL or AVG
        matching = allSold.filter(it => it.series === ser);
      }
    }

    if (matching.length === 0) return;

    if (specFilter === 'AVG') {
      const avgPrice = Math.round(matching.reduce((acc, x) => acc + x.price, 0) / matching.length);
      points.push({
        series: ser,
        shortLabel: shortLabels[ser] || ser,
        price: avgPrice,
        color: seriesColors[ser] || '#818cf8',
        details: { count: matching.length, label: '平均成交價' }
      });
    } else {
      matching.sort((a, b) => {
        const dDiff = (b.date || '').localeCompare(a.date || '');
        if (dDiff !== 0) return dDiff;
        return (b.id || '').localeCompare(a.id || '');
      });
      const top = matching[0];
      points.push({
        series: ser,
        shortLabel: shortLabels[ser] || ser,
        price: top.price,
        color: seriesColors[ser] || '#818cf8',
        details: {
          count: matching.length,
          date: top.date,
          model: top.model,
          capacity: top.capacity,
          id: top.id,
          url: top.url
        }
      });
    }
  });

  if (points.length === 0) {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.fillStyle = '#94a3b8';
    c.font = '13px Inter, sans-serif';
    c.textAlign = 'center';
    c.fillText('所選規格在當前時間區間內無已成交紀錄', canvas.width / 2, canvas.height / 2);
    c.restore();
    if (summaryEl) summaryEl.innerHTML = '<span class="text-slate-500">無足夠成交資料以比較跨代價差</span>';
    return;
  }

  // Calculate gaps
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const diff = points[i].price - prev.price;
      const diffPct = prev.price > 0 ? Math.round((diff / prev.price) * 1000) / 10 : 0;
      points[i].diff = diff;
      points[i].diffPct = diffPct;
      points[i].prevLabel = prev.shortLabel;
    }
    if (i < points.length - 1) {
      const next = points[i + 1];
      points[i].nextDiff = next.price - points[i].price;
      points[i].nextLabel = next.shortLabel;
    }
  }

  // Render bottom summary cards
  if (summaryEl) {
    let summaryHtml = '';
    points.forEach((p, idx) => {
      summaryHtml += `
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 shadow-sm">
          <span class="font-bold text-slate-200">${p.shortLabel}</span>
          <span class="font-semibold text-sky-400">NT$ ${p.price.toLocaleString()}</span>
        </div>
      `;
      if (idx < points.length - 1 && points[idx + 1].diff !== undefined) {
        const nextDiff = points[idx + 1].diff;
        const nextPct = points[idx + 1].diffPct;
        const isUp = nextDiff >= 0;
        const colorClass = isUp ? 'text-purple-400' : 'text-rose-400';
        const sign = isUp ? '+' : '';
        summaryHtml += `
          <div class="flex items-center ${colorClass} font-medium text-xs px-1">
            <span>${sign}$${nextDiff.toLocaleString()}</span>
            <span class="text-[10px] ml-1 opacity-80">(${sign}${nextPct}%)</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5 ml-1"></i>
          </div>
        `;
      }
    });
    summaryEl.innerHTML = summaryHtml;
    if (window.lucide && lucide.createIcons) {
      lucide.createIcons({ root: summaryEl });
    }
  }

  // Custom Chart.js plugin to draw price numbers and gap badges directly onto the chart
  const gapVisualPlugin = {
    id: 'gapVisualPlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const elements = meta.data;

      elements.forEach((bar, idx) => {
        const p = points[idx];
        if (!p || p.price === null) return;

        ctx.save();
        // 1. Text above bar: price
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`$${p.price.toLocaleString()}`, bar.x, bar.y - 6);

        // 2. Connector & Gap badge to next bar
        if (idx < elements.length - 1 && points[idx + 1] && points[idx + 1].diff !== undefined) {
          const nextBar = elements[idx + 1];
          const diff = points[idx + 1].diff;
          const sign = diff >= 0 ? '+' : '';
          const diffText = `${sign}$${diff.toLocaleString()}`;

          const midX = (bar.x + nextBar.x) / 2;
          const topY = Math.min(bar.y, nextBar.y) - 22;

          // Connecting bracket line
          ctx.beginPath();
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = diff >= 0 ? 'rgba(192, 132, 252, 0.4)' : 'rgba(244, 63, 94, 0.4)';
          ctx.lineWidth = 1;
          ctx.moveTo(bar.x, bar.y - 10);
          ctx.lineTo(bar.x, topY + 6);
          ctx.lineTo(nextBar.x, topY + 6);
          ctx.lineTo(nextBar.x, nextBar.y - 10);
          ctx.stroke();
          ctx.setLineDash([]);

          // Badge pill
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          const textW = ctx.measureText(diffText).width;
          const bW = textW + 12;
          const bH = 17;
          const bX = midX - bW / 2;
          const bY = topY - bH / 2 + 6;

          ctx.fillStyle = diff >= 0 ? 'rgba(88, 28, 135, 0.9)' : 'rgba(159, 18, 57, 0.9)';
          ctx.strokeStyle = diff >= 0 ? '#c084fc' : '#fb7185';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(bX, bY, bW, bH, 8);
          } else {
            ctx.rect(bX, bY, bW, bH);
          }
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = diff >= 0 ? '#f3e8ff' : '#ffe4e6';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(diffText, midX, bY + bH / 2);
        }
        ctx.restore();
      });
    }
  };

  const maxPrice = Math.max(...points.map(p => p.price));

  gapChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: points.map(p => p.shortLabel),
      datasets: [{
        label: specFilter === 'AVG' ? '世代平均成交價' : '最新成交價',
        data: points.map(p => p.price),
        backgroundColor: points.map(p => {
          const c = p.color;
          return c.startsWith('#') ? c + 'cc' : c;
        }),
        borderColor: points.map(p => p.color),
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const pt = points[idx];
          if (pt && pt.series) {
            setSeriesFilter(pt.series);
            const sec = document.getElementById('summary-tbody');
            if (sec) {
              sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      },
      layout: {
        padding: {
          top: 36,
          bottom: 4
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(51, 65, 85, 0.8)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const p = points[items[0].dataIndex];
              return `${p.series} (${p.shortLabel})`;
            },
            label: (ctx) => {
              const p = points[ctx.dataIndex];
              const lines = [];
              const typeLabel = specFilter === 'AVG' ? '世代平均價' : '最新成交價';
              lines.push(`${typeLabel}: NT$ ${p.price.toLocaleString()}`);

              if (p.diff !== undefined) {
                const s = p.diff >= 0 ? '+' : '';
                lines.push(`較上一代 (${p.prevLabel}): ${s}NT$ ${p.diff.toLocaleString()} (${s}${p.diffPct}%)`);
              }
              if (p.nextDiff !== undefined) {
                const s = p.nextDiff >= 0 ? '+' : '';
                lines.push(`升級下一代 (${p.nextLabel}): ${s}NT$ ${p.nextDiff.toLocaleString()}`);
              }
              if (p.details && p.details.date) {
                lines.push(`成交日期: ${p.details.date}`);
                if (p.details.model) {
                  lines.push(`規格: ${p.details.model} ${p.details.capacity || ''}`);
                }
              }
              if (p.details && p.details.count) {
                lines.push(`同條件樣本數: ${p.details.count} 篇`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#cbd5e1', font: { size: 11, weight: '600' } },
          grid: { display: false }
        },
        y: {
          suggestedMax: maxPrice * 1.15,
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (v) => `$${(v / 1000).toFixed(0)}k`
          },
          grid: { color: 'rgba(51, 65, 85, 0.3)' }
        }
      }
    },
    plugins: [gapVisualPlugin]
  });
}

function updateSubmodelDropdown(series) {
  const modelSelect = document.getElementById('filter-model');
  if (!modelSelect) return;
  const currentVal = modelSelect.value;
  
  if (activeCategory === 'iphone') {
    let options = [
      { val: 'ALL', label: '全部子機型' },
      { val: 'Pro Max', label: 'Pro Max' },
      { val: 'Pro', label: 'Pro' },
      { val: 'Plus', label: 'Plus' },
      { val: '標準版', label: '標準版' },
      { val: 'mini', label: 'mini' },
    ];
    if (series === 'iPhone 13') {
      options = [
        { val: 'ALL', label: '全部子機型' },
        { val: 'Pro Max', label: 'Pro Max' },
        { val: 'Pro', label: 'Pro' },
        { val: '標準版', label: '標準版' },
        { val: 'mini', label: 'mini' },
      ];
    } else if (series === 'iPhone 14' || series === 'iPhone 15' || series === 'iPhone 16' || series === 'iPhone 17') {
      options = [
        { val: 'ALL', label: '全部子機型' },
        { val: 'Pro Max', label: 'Pro Max' },
        { val: 'Pro', label: 'Pro' },
        { val: 'Plus', label: 'Plus' },
        { val: '標準版', label: '標準版' },
      ];
    } else if (series === 'iPhone 18') {
      options = [
        { val: 'ALL', label: '全部子機型' },
        { val: 'Pro Max', label: 'Pro Max' },
        { val: 'Pro', label: 'Pro' },
        { val: '標準版', label: '標準版' },
      ];
    }
    modelSelect.innerHTML = options.map(o => `<option value="${o.val}">${o.label}</option>`).join('');
    if (options.some(o => o.val === currentVal)) {
      modelSelect.value = currentVal;
    } else {
      modelSelect.value = 'ALL';
    }
  }
}

// Filter Logic
function setSeriesFilter(series, autoApply = true) {
  currentFilters.series = series;
  updateSubmodelDropdown(series);
  document.querySelectorAll('#series-badges .badge-btn').forEach(btn => {
    if (btn.getAttribute('data-val') === series) {
      btn.className = 'badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-sky-600 text-white transition';
    } else {
      btn.className = 'badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
    }
  });
  if (autoApply) {
    applyFilters();
  }
}

function resetAllFilters() {
  currentFilters.series = 'ALL';
  document.querySelectorAll('#series-badges .badge-btn').forEach(btn => {
    if (btn.getAttribute('data-val') === 'ALL') {
      btn.className = 'badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-sky-600 text-white transition';
    } else {
      btn.className = 'badge-btn px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
    }
  });
  const modelSelect = document.getElementById('filter-model');
  if (modelSelect) modelSelect.value = 'ALL';
  const capSelect = document.getElementById('filter-capacity');
  if (capSelect) capSelect.value = 'ALL';
  const statusSelect = document.getElementById('filter-status');
  if (statusSelect) statusSelect.value = 'ALL';
  const kwInput = document.getElementById('filter-keyword');
  if (kwInput) kwInput.value = '';

  document.querySelectorAll('#summary-tbody tr').forEach(r => {
    r.classList.remove('bg-sky-950/60', 'border-l-4', 'border-sky-400');
  });

  applyFilters();
}

function applyFilters() {
  if (!rawData || !rawData.items) return;

  const modelVal = document.getElementById('filter-model').value;
  const capVal = document.getElementById('filter-capacity').value;
  const statusVal = document.getElementById('filter-status').value;
  const keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();

  // Check if keyword is a direct URL or Article ID lookup
  const isDirectLookup = keyword.includes('ptt.cc') || /m\.\d+\.a\.[0-9a-z]+/i.test(keyword);

  filteredItems = rawData.items.filter(item => {
    // If it's a direct article URL or ID search, match directly across all items regardless of active category/date filters
    if (isDirectLookup) {
      const matchUrl = item.url && item.url.toLowerCase().includes(keyword);
      const matchId = item.id && item.id.toLowerCase().includes(keyword);
      return matchUrl || matchId;
    }

    // Device Category filter
    if (item.device_type !== activeCategory) return false;

    // Filter out pure accessory items (cases, tempered films, screen protectors)
    const titleLower = (item.title || '').toLowerCase();
    const isAccItem = /(?:手機殼|保護殼|防摔殼|透明殼|聰穎殼|鋼化膜|保護貼|玻璃貼|保貼|鏡頭貼|鏡頭膜|保護套|皮套|殼貼)/.test(titleLower) &&
      !/(?:送|附|含|贈)/.test(titleLower) &&
      !/\b(64|128|256|512)\s*g|\b(1|2)\s*t\b/.test(titleLower);
    if (isAccItem) return false;

    // Date range filter
    if (currentDateRange.startDate && item.date < currentDateRange.startDate) return false;
    if (currentDateRange.endDate && item.date > currentDateRange.endDate) return false;

    // Series filter
    if (currentFilters.series !== 'ALL' && item.series !== currentFilters.series) return false;
    
    // Model filter
    if (modelVal !== 'ALL') {
      if (activeCategory === 'iphone') {
        if (modelVal === '標準版') {
          // Standard base model: does NOT have Pro, Plus, or mini
          if (item.model.includes('Pro') || item.model.includes('Plus') || item.model.includes('mini')) {
            return false;
          }
        } else if (modelVal === 'Pro') {
          // Strictly Pro only (must NOT match Pro Max)
          if (!item.model.includes('Pro') || item.model.includes('Pro Max')) {
            return false;
          }
        } else if (modelVal === 'Pro Max') {
          if (!item.model.includes('Pro Max')) return false;
        } else if (modelVal === 'Plus') {
          if (!item.model.includes('Plus')) return false;
        } else if (modelVal === 'mini') {
          if (!item.model.includes('mini')) return false;
        }
      } else {
        // iPad mini
        if (modelVal === 'WiFi') {
          if (!item.model.includes('WiFi')) return false;
        } else if (modelVal === 'Cellular') {
          if (!item.model.includes('Cellular')) return false;
        }
      }
    }

    // Capacity filter
    if (capVal !== 'ALL' && item.capacity !== capVal) return false;

    // Status filter
    if (statusVal !== 'ALL' && item.status !== statusVal) return false;

    // Bargain deal filter
    if (onlyBargain) {
      if (item.status !== '販售中') return false;
      const median = window.modelMedianMap ? window.modelMedianMap[`${item.model}_${item.capacity}`] : null;
      if (!median || !item.price) return false;
      const diff = median - item.price;
      if (diff < 1200 || (diff / median) < 0.07) return false;
    }

    // Keyword filter (multi-term matching)
    if (keyword) {
      const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean);
      const targetStr = `${item.title} ${item.model} ${item.series} ${item.capacity} ${item.price || ''} ${item.raw_price || ''} ${item.location || ''} ${item.status} ${item.warranty || ''} ${item.date} ${item.url || ''} ${item.id || ''}`.toLowerCase();
      const allMatched = terms.every(term => targetStr.includes(term));
      if (!allMatched) return false;
    }

    return true;
  });

  updateFilterChips(modelVal, capVal, statusVal, keyword);
  syncSummaryTableHighlight(currentFilters.series, modelVal, capVal);

  sortItems();
  currentPage = 1;
  renderArticlesTable();
}

function updateFilterChips(modelVal, capVal, statusVal, keyword) {
  const container = document.getElementById('active-filter-chips');
  if (!container) return;

  const chips = [];
  if (currentDateRange.preset !== 'all') {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700/60 text-purple-200 text-xs font-mono">📅 期間: ${currentDateRange.startDate} ~ ${currentDateRange.endDate}</span>`);
  }
  if (onlyBargain) {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-900/70 border border-emerald-500/60 text-emerald-200 text-xs font-bold">🔥 僅看超值撿漏好康</span>`);
  }
  if (currentFilters.series !== 'ALL') {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-sky-900/60 border border-sky-700/60 text-sky-200 text-xs font-mono">${currentFilters.series}</span>`);
  }
  if (modelVal !== 'ALL') {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-sky-900/60 border border-sky-700/60 text-sky-200 text-xs font-mono">${modelVal}</span>`);
  }
  if (capVal !== 'ALL') {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-indigo-900/60 border border-indigo-700/60 text-indigo-200 text-xs font-mono">${capVal}</span>`);
  }
  if (statusVal !== 'ALL') {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">${statusVal}</span>`);
  }
  if (keyword) {
    chips.push(`<span class="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">搜尋: "${keyword}"</span>`);
  }

  if (chips.length > 0) {
    container.innerHTML = `
      <div class="flex items-center flex-wrap gap-2 py-2 px-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
        <span class="text-slate-400 font-medium flex items-center gap-1">
          <i data-lucide="filter" class="w-3.5 h-3.5 text-sky-400"></i> 當前篩選：
        </span>
        <div class="flex items-center flex-wrap gap-1.5">${chips.join('')}</div>
        <button onclick="resetAllFilters()" class="text-sky-400 hover:text-sky-300 underline font-medium ml-auto transition flex items-center gap-1">
          <i data-lucide="x" class="w-3 h-3"></i> 清除條件
        </button>
      </div>
    `;
    container.classList.remove('hidden');
    initIcons();
  } else {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
}

function syncSummaryTableHighlight(series, modelVal, capVal) {
  document.querySelectorAll('#summary-tbody tr').forEach(r => {
    const rSeries = r.getAttribute('data-series');
    const rModel = r.getAttribute('data-model');
    const rCap = r.getAttribute('data-capacity');

    let sub = 'ALL';
    if (activeCategory === 'iphone') {
      if (rModel.includes('Pro Max')) sub = 'Pro Max';
      else if (rModel.includes('Pro')) sub = 'Pro';
      else if (rModel.includes('Plus')) sub = 'Plus';
      else if (rModel.includes('mini')) sub = 'mini';
      else sub = '標準版';
    } else {
      if (rModel.includes('Cellular')) sub = 'Cellular';
      else if (rModel.includes('WiFi')) sub = 'WiFi';
    }

    const isMatch = (series === rSeries) && (modelVal === sub) && (capVal === rCap);
    if (isMatch) {
      r.classList.add('bg-sky-950/60', 'border-l-4', 'border-sky-400');
    } else {
      r.classList.remove('bg-sky-950/60', 'border-l-4', 'border-sky-400');
    }
  });
}

function changeSort(field) {
  if (currentSort.field === field) {
    currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.order = 'desc';
  }
  sortItems();
  renderArticlesTable();
}

function sortItems() {
  filteredItems.sort((a, b) => {
    let valA = a[currentSort.field];
    let valB = b[currentSort.field];
    if (currentSort.field === 'price') {
      valA = valA || 0;
      valB = valB || 0;
    }
    if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderArticlesTable() {
  const total = filteredItems.length;
  document.getElementById('filtered-count').textContent = total;
  document.getElementById('page-total').textContent = total;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);

  document.getElementById('page-start').textContent = total === 0 ? 0 : startIdx + 1;
  document.getElementById('page-end').textContent = endIdx;
  document.getElementById('page-current').textContent = `${currentPage} / ${totalPages}`;

  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;

  const tbody = document.getElementById('articles-tbody');
  tbody.innerHTML = '';

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-8 text-center text-slate-500">
          查無符合條件的文章資料
        </td>
      </tr>
    `;
    return;
  }

  const pageItems = filteredItems.slice(startIdx, endIdx);
  pageItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition';

    let badgeClass = 'badge-active';
    let priceClass = 'price-active';
    if (item.status === '已售出') {
      badgeClass = 'badge-sold';
      priceClass = 'price-sold';
    } else if (item.status === '暫售') {
      badgeClass = 'badge-reserved';
      priceClass = 'text-amber-400 font-bold';
    } else if (item.status === '洽中') {
      badgeClass = 'badge-pending';
      priceClass = 'text-purple-400 font-bold';
    }

    // Status / Bargain badge
    let statusBadgeHtml = `
      <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${badgeClass}">
        ${item.status}
      </span>
    `;

    if (item.status === '販售中' && item.price) {
      const median = window.modelMedianMap ? window.modelMedianMap[`${item.model}_${item.capacity}`] : null;
      if (median && median > 0) {
        const diff = median - item.price;
        if (diff >= 1200 && (diff / median) >= 0.07) {
          statusBadgeHtml = `
            <div class="flex flex-col gap-1 items-start">
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${badgeClass}">販售中</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 animate-pulse whitespace-nowrap">🔥 低於行情 $${diff.toLocaleString()}</span>
            </div>
          `;
        } else if (diff <= -median * 0.15) {
          statusBadgeHtml = `
            <div class="flex flex-col gap-1 items-start">
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${badgeClass}">販售中</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">⚠️ 開高 (+${Math.abs(diff).toLocaleString()})</span>
            </div>
          `;
        }
      }
    }

    const priceText = item.price ? `NT$ ${item.price.toLocaleString()}` : (item.raw_price || '面議/未標');
    
    // Battery styling
    let batteryHtml = '<span class="text-slate-500">-</span>';
    if (item.battery) {
      if (item.battery >= 90) {
        batteryHtml = `<span class="font-bold text-emerald-400 font-mono">${item.battery}%</span>`;
      } else if (item.battery >= 80) {
        batteryHtml = `<span class="text-sky-300 font-mono">${item.battery}%</span>`;
      } else {
        batteryHtml = `<span class="font-bold text-rose-400 font-mono" title="低於80%建議更換原廠電池">${item.battery}% ⚠️</span>`;
      }
    }

    // Warranty styling
    let warrantyHtml = '<span class="text-slate-500 text-[11px]">已過保</span>';
    const w = item.warranty || '已過保';
    if (w === 'AppleCare+') {
      warrantyHtml = `<span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold text-[11px] whitespace-nowrap">AppleCare+</span>`;
    } else if (w.includes('保內') || w.includes('保至') || w === '原廠保固中') {
      warrantyHtml = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] whitespace-nowrap">${w}</span>`;
    } else if (w === '全新/未開通') {
      warrantyHtml = `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] whitespace-nowrap">全新未拆</span>`;
    } else {
      warrantyHtml = `<span class="text-slate-400 text-[11px]">${w}</span>`;
    }

    tr.innerHTML = `
      <td class="py-3 px-4">${statusBadgeHtml}</td>
      <td class="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">${item.date}</td>
      <td class="py-3 px-4 text-slate-300">${item.location || '全國'}</td>
      <td class="py-3 px-4 font-medium text-slate-200 whitespace-nowrap">${item.model}</td>
      <td class="py-3 px-4"><span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">${item.capacity}</span></td>
      <td class="py-3 px-4 font-mono ${priceClass} whitespace-nowrap">
        ${priceText}
      </td>
      <td class="py-3 px-4 font-mono">${batteryHtml}</td>
      <td class="py-3 px-4">${warrantyHtml}</td>
      <td class="py-3 px-4 max-w-md truncate">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="text-slate-300 hover:text-sky-400 hover:underline transition">
          ${item.title}
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  initIcons();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderArticlesTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    renderArticlesTable();
  }
}

function exportCSV() {
  if (!filteredItems || filteredItems.length === 0) {
    alert('目前無資料可匯出');
    return;
  }

  const headers = ['狀態', '日期', '地點', '類別', '系列', '機型', '容量', '售價(NTD)', '電池健康度', '保固狀態', '標題', '連結'];
  const rows = filteredItems.map(it => [
    it.status,
    it.date,
    it.location || '全國',
    it.device_type,
    it.series,
    it.model,
    it.capacity,
    it.price || '',
    it.battery ? `${it.battery}%` : '',
    it.warranty || '已過保',
    `"${it.title.replace(/"/g, '""')}"`,
    it.url
  ]);

  const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PTT_MacShop_${activeCategory}_Prices_${currentDateRange.startDate}_至_${currentDateRange.endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Expose global functions to window
window.setDatePreset = setDatePreset;
window.onCustomDateChange = onCustomDateChange;
window.resetDateRange = resetDateRange;
window.switchCategory = switchCategory;
window.setSeriesFilter = setSeriesFilter;
window.resetAllFilters = resetAllFilters;
window.applyFilters = applyFilters;
window.changeSort = changeSort;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.exportCSV = exportCSV;

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});
