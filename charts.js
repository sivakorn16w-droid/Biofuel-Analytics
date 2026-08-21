/**
 * charts.js — Biofuel Analytics Split Dashboard (Single Page)
 *
 * ONE page shows BOTH fuels side-by-side:
 *   • Left  — Ethanol (เอทานอล)
 *   • Right — Biodiesel (B100)
 *
 * Each column is an independent dashboard containing (per fuel):
 *   KPI (การผลิต | การใช้) → Main Trend Chart (monthly line) →
 *   Yearly Bar Chart → Monthly Bar Chart (with year selector)
 *
 * All period charts respect the SHARED year-range + month-range filter.
 * No Executive Summary, no large summary cards, no cross-fuel comparison.
 * Gap is shown inside tooltips and the data table (not as a big card).
 * All values come from DataStore (data.js) — never hardcoded.
 */

(() => {
  if (typeof DataStore === 'undefined' || typeof Chart === 'undefined') return;

  /* ================================================================
     CONFIGURATION
     ================================================================ */

  const COLORS = {
    prod: '#059669',
    cons: '#F97316',
    gap:  '#0F9E9A',
    pos:  '#16A34A',
    neg:  '#EF4444',
    neutral: '#64748B',
  };

  const UNIT = 'ล้านลิตร/วัน';

  const FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  // Two independent fuel columns, keyed to element prefixes (eth*, bio*).
  const FUELS = [
    {
      id: 'eth',
      name: 'เอทานอล',
      enName: 'Ethanol',
      prodKey: 'ethanol_production',
      consKey: 'ethanol_consumption',
      prodColor: COLORS.prod,
      consColor: COLORS.cons,
      gapColor: COLORS.gap,
    },
    {
      id: 'bio',
      name: 'ไบโอดีเซล (B100)',
      enName: 'Biodiesel',
      prodKey: 'biodiesel_production',
      consKey: 'biodiesel_consumption',
      prodColor: COLORS.prod,
      consColor: COLORS.cons,
      gapColor: COLORS.gap,
    },
  ];

  /* ================================================================
     STATE — shared filter + per-fuel monthly-chart year
     ================================================================ */

  const state = {
    yearStart: DataStore.YEARS[0],
    yearEnd: DataStore.YEARS[DataStore.YEARS.length - 1],
    monthStart: '0',
    monthEnd: '11',
    monthYear: { eth: DataStore.LATEST.year, bio: DataStore.LATEST.year },
    tableFilter: 'all',
    search: '',
    // per-fuel year selection for main trend small multiples
    selectedYears: {
      eth: [DataStore.LATEST.year],
      bio: [DataStore.LATEST.year],
    },
    // per-chart display type ('line' | 'bar'), independent per card
    chartType: {
      'eth.main': 'line', 'eth.year': 'bar', 'eth.month': 'bar',
      'bio.main': 'line', 'bio.year': 'bar', 'bio.month': 'bar',
    },
  };

  window.state = state;

  const charts = {}; // keyed by e.g. 'eth.main', 'eth.year', 'eth.month'

  /* ================================================================
     THEME HELPERS
     ================================================================ */

  function textColor() { return getComputedStyle(document.body).getPropertyValue('--text').trim() || '#1B4332'; }
  function dimColor() { return getComputedStyle(document.body).getPropertyValue('--text-dim').trim() || '#4F6F52'; }
  function faintColor() { return getComputedStyle(document.body).getPropertyValue('--text-faint').trim() || '#6B8A6D'; }
  function borderColor() { return getComputedStyle(document.body).getPropertyValue('--border').trim() || '#DDEBDD'; }
  function cardColor() { return getComputedStyle(document.body).getPropertyValue('--card').trim() || '#FFFFFF'; }

  /* ================================================================
     FORMATTING
     ================================================================ */

  function fmt(n, digits = 3) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return n.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtPct(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  }

  /* ================================================================
     TOOLTIP STYLE
     ================================================================ */

  function tooltipConfig(accentColor) {
    return {
      backgroundColor: () => cardColor(),
      titleColor: () => textColor(),
      bodyColor: () => dimColor(),
      footerColor: () => faintColor(),
      borderColor: accentColor || COLORS.prod,
      borderWidth: 1,
      padding: { top: 7, bottom: 7, left: 10, right: 10 },
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 3,
      titleFont: { weight: '600', size: 12, family: "'Poppins','Kanit',sans-serif" },
      bodyFont: { family: "'Poppins','Kanit',sans-serif", size: 11.5 },
      footerFont: { family: "'Poppins','Kanit',sans-serif", size: 11, style: 'italic' },
      titleMarginBottom: 5,
      bodySpacing: 3,
      footerMarginTop: 5,
      external: positionTooltip,
      position: 'nearest',
    };
  }

  /** Keep the tooltip inside the canvas bounds (auto-flip near edges). */
  function positionTooltip(context) {
    const { chart, tooltip } = context;
    if (!tooltip) return;
    const el = tooltip;
    if (el.opacity === 0) { el.borderColor = 'transparent'; return; }
    const chartArea = chart.chartArea;
    if (!chartArea) return;
    let x = el.caretX;
    let y = el.caretY;
    // clamp to chart area so it never overflows the card
    x = Math.max(chartArea.left + 4, Math.min(chartArea.right - 4, x));
    y = Math.max(chartArea.top + 4, Math.min(chartArea.bottom - 4, y));
    el.x = x;
    el.y = y;
    el.caretX = x;
    el.caretY = y;
  }

  /* ================================================================
     SHARED FILTER RANGE HELPERS
     ================================================================ */

  function yearRange() {
    let s = DataStore.YEARS.indexOf(state.yearStart);
    let e = DataStore.YEARS.indexOf(state.yearEnd);
    if (s === -1) s = 0;
    if (e === -1) e = DataStore.YEARS.length - 1;
    if (s > e) { const t = s; s = e; e = t; }
    return { s, e };
  }

  function getYears() {
    const { s, e } = yearRange();
    return DataStore.YEARS.slice(s, e + 1);
  }

  function monthRange() {
    let s = parseInt(state.monthStart, 10);
    let e = parseInt(state.monthEnd, 10);
    if (Number.isNaN(s)) s = 0;
    if (Number.isNaN(e)) e = 11;
    if (s > e) { const t = s; s = e; e = t; }
    return { s, e };
  }

  function rangeAvg(key, year) {
    const row = DataStore.RAW_DATA[key] && DataStore.RAW_DATA[key][year];
    if (!row) return null;
    const { s, e } = monthRange();
    let sum = 0;
    let count = 0;
    for (let i = s; i <= e; i++) {
      const v = row[i];
      if (v !== null && v !== undefined) { sum += v; count++; }
    }
    return count > 0 ? sum / count : null;
  }

  function rangeSeries(key, year) {
    const row = DataStore.RAW_DATA[key] && DataStore.RAW_DATA[key][year];
    if (!row) return [];
    const { s, e } = monthRange();
    const out = [];
    for (let i = s; i <= e; i++) out.push(row[i] ?? null);
    return out;
  }

  function rangeAllAvg(key) {
    let sum = 0;
    let count = 0;
    getYears().forEach((y) => {
      rangeSeries(key, y).forEach((v) => {
        if (v !== null && v !== undefined) { sum += v; count++; }
      });
    });
    return count > 0 ? sum / count : null;
  }

  function rangeAllSeries(key) {
    const out = [];
    getYears().forEach((y) => out.push(...rangeSeries(key, y)));
    return out;
  }

  function rangeAllMin(key) {
    const vals = rangeAllSeries(key).filter((v) => v !== null && v !== undefined);
    return vals.length ? Math.min(...vals) : null;
  }

  function rangeAllMax(key) {
    const vals = rangeAllSeries(key).filter((v) => v !== null && v !== undefined);
    return vals.length ? Math.max(...vals) : null;
  }

  function rangeLabels() {
    const { s, e } = monthRange();
    return DataStore.MONTHS_TH.slice(s, e + 1);
  }

  function rangeMonthText() {
    const { s, e } = monthRange();
    if (s === 0 && e === 11) return 'ทั้งปี';
    return `${DataStore.MONTHS_TH[s]}–${DataStore.MONTHS_TH[e]}`;
  }

  function rangeYearText() {
    const years = getYears();
    if (years.length <= 1) return `ปี ${state.yearStart}`;
    return `ปี ${years[0]}–${years[years.length - 1]}`;
  }

  function gapOfYear(prodKey, consKey, year) {
    const p = rangeAvg(prodKey, year);
    const c = rangeAvg(consKey, year);
    return (p !== null && c !== null) ? p - c : null;
  }

  function trendPct(key) {
    const years = getYears();
    if (!years.length) return null;
    if (years.length > 1) {
      return DataStore.pctChange(rangeAvg(key, years[years.length - 1]), rangeAvg(key, years[0]));
    }
    const y = years[0];
    const prevIdx = DataStore.YEARS.indexOf(y) - 1;
    const prevYear = prevIdx >= 0 ? DataStore.YEARS[prevIdx] : null;
    return prevYear ? DataStore.pctChange(rangeAvg(key, y), rangeAvg(key, prevYear)) : null;
  }

  /* ================================================================
     ELEMENT + RENDERING UTILITIES
     ================================================================ */

  function el(id) { return document.getElementById(id); }

  function hexToRgba(hex, alpha) {
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  /** Lighten (amt>0) or darken (amt<0) a hex color by amt (0–1). Used to give
   *  each year its own shade within the same prod/cons color family on the
   *  multi-year trend chart, so series stay visually distinguishable. */
  function shade(hex, amt) {
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const n = parseInt(full, 16);
    let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255;
    const mix = (v) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
    r = Math.round(Math.min(255, Math.max(0, mix(r))));
    g = Math.round(Math.min(255, Math.max(0, mix(g))));
    b = Math.round(Math.min(255, Math.max(0, mix(b))));
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function setTrendEl(id, pct) {
    const e = document.getElementById(id);
    if (!e) return;
    const up = (pct ?? 0) >= 0;
    e.className = `kpi-trend ${up ? 'pos' : 'neg'}`;
    e.innerHTML = `<i class="fa-solid fa-arrow-${up ? 'up' : 'down'}"></i> <span>${fmtPct(pct)}</span>`;
  }

  function fullMonthName(indexWithinRange) {
    const { s } = monthRange();
    return FULL_MONTHS[s + indexWithinRange] || '';
  }

  /* ================================================================
     FILTER BAR WIRING — shared for both columns
     ================================================================ */

  function initFilterBar() {
    const yearStartSel = el('filterYearStart');
    const yearEndSel = el('filterYearEnd');
    const startSel = el('filterMonthStart');
    const endSel = el('filterMonthEnd');
    const resetBtn = el('resetFilters');

    [yearStartSel, yearEndSel].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      DataStore.YEARS.forEach((y) => {
        const o = document.createElement('option');
        o.value = y; o.textContent = `${y}`;
        sel.appendChild(o);
      });
    });
    [startSel, endSel].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      DataStore.MONTHS_TH.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = m;
        sel.appendChild(o);
      });
    });

    if (yearStartSel) yearStartSel.value = state.yearStart;
    if (yearEndSel) yearEndSel.value = state.yearEnd;
    if (startSel) startSel.value = state.monthStart;
    if (endSel) endSel.value = state.monthEnd;

    if (yearStartSel) yearStartSel.addEventListener('change', () => { syncYearSelects(); renderAll(); });
    if (yearEndSel) yearEndSel.addEventListener('change', () => { syncYearSelects(); renderAll(); });
    if (startSel) startSel.addEventListener('change', () => { syncMonthSelects(); renderAll(); });
    if (endSel) endSel.addEventListener('change', () => { syncMonthSelects(); renderAll(); });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.yearStart = DataStore.YEARS[0];
        state.yearEnd = DataStore.YEARS[DataStore.YEARS.length - 1];
        state.monthStart = '0';
        state.monthEnd = '11';
        if (yearStartSel) yearStartSel.value = state.yearStart;
        if (yearEndSel) yearEndSel.value = state.yearEnd;
        if (startSel) startSel.value = '0';
        if (endSel) endSel.value = '11';
        renderAll();
      });
    }
  }

  function syncYearSelects() {
    const startSel = el('filterYearStart');
    const endSel = el('filterYearEnd');
    if (!startSel || !endSel) return;
    let s = DataStore.YEARS.indexOf(startSel.value);
    let e = DataStore.YEARS.indexOf(endSel.value);
    if (s === -1) s = 0;
    if (e === -1) e = DataStore.YEARS.length - 1;
    if (s > e) {
      const t = s; s = e; e = t;
      startSel.value = DataStore.YEARS[s];
      endSel.value = DataStore.YEARS[e];
    }
    state.yearStart = startSel.value;
    state.yearEnd = endSel.value;
  }

  function syncMonthSelects() {
    const startSel = el('filterMonthStart');
    const endSel = el('filterMonthEnd');
    if (!startSel || !endSel) return;
    let s = parseInt(startSel.value, 10);
    let e = parseInt(endSel.value, 10);
    if (s > e) {
      const t = s; s = e; e = t;
      startSel.value = String(s);
      endSel.value = String(e);
    }
    state.monthStart = startSel.value;
    state.monthEnd = endSel.value;
  }

  /* ================================================================
     MONTHLY CHART YEAR SELECTORS (per fuel)
     ================================================================ */

  function initMonthYearSelectors() {
    FUELS.forEach((fuel) => {
      const monthSel = el(`${fuel.id}MonthYear`);
      if (!monthSel) return;
      monthSel.innerHTML = '';
      DataStore.YEARS.forEach((y) => {
        const o = document.createElement('option');
        o.value = y; o.textContent = `ปี ${y}`;
        monthSel.appendChild(o);
      });
      monthSel.value = state.monthYear[fuel.id];
      monthSel.addEventListener('change', () => {
        state.monthYear[fuel.id] = monthSel.value;
        renderFuelMonthChart(fuel);
      });
    });
  }

  /** Ensure the per-fuel monthly-chart year selector stays within the selected year range. */
  function clampMonthYears() {
    const years = getYears();
    if (!years.length) return;
    FUELS.forEach((fuel) => {
      const sel = el(`${fuel.id}MonthYear`);
      if (!years.includes(state.monthYear[fuel.id])) {
        state.monthYear[fuel.id] = years[years.length - 1];
        if (sel) sel.value = state.monthYear[fuel.id];
      } else if (sel) {
        sel.value = state.monthYear[fuel.id];
      }
    });
  }

  /* ================================================================
     YEAR PILLS — per-fuel year selector for main trend small multiples
     ================================================================ */

  const MAX_YEAR_SELECTIONS = 5;

  function getTrendYears(fuelId) {
    return state.selectedYears[fuelId] || [DataStore.LATEST.year];
  }

  function toggleYear(fuelId, year) {
    const sel = state.selectedYears[fuelId];
    const idx = sel.indexOf(year);
    if (idx >= 0) {
      sel.splice(idx, 1);
      // If all removed, force latest year back
      if (sel.length === 0) sel.push(DataStore.LATEST.year);
    } else {
      if (sel.length >= MAX_YEAR_SELECTIONS) return;
      sel.push(year);
      sel.sort((a, b) => DataStore.YEARS.indexOf(a) - DataStore.YEARS.indexOf(b));
    }
  }

  function syncPillVisuals(fuelId) {
    const container = el(`${fuelId}YearPills`);
    if (!container) return;
    const sel = state.selectedYears[fuelId];
    container.querySelectorAll('.year-pill').forEach((btn) => {
      const y = btn.dataset.year;
      const isActive = sel.includes(y);
      btn.classList.toggle('year-pill--active', isActive);
    });
  }

  function initYearPills() {
    FUELS.forEach((fuel) => {
      const container = el(`${fuel.id}YearPills`);
      if (!container) return;
      container.innerHTML = '';
      DataStore.YEARS.forEach((year) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'year-pill';
        btn.dataset.year = year;
        btn.textContent = year;
        btn.addEventListener('click', () => {
          toggleYear(fuel.id, year);
          syncPillVisuals(fuel.id);
          renderFuelMainChart(fuel);
          // Sync modal if open for this fuel's main chart
          const chartKey = `${fuel.id}.main`;
          if (modalState.open && modalState.chartKey === chartKey) {
            syncModalYearPills(chartKey);
            renderModalChart(chartKey);
          }
        });
        container.appendChild(btn);
      });
      syncPillVisuals(fuel.id);
    });
  }

  /* ================================================================
     CHART-TYPE TOGGLES (เส้น | แท่ง) — independent state per chart
     ================================================================ */

  // maps a chartKey like 'eth.main' to its render function
  function rendererFor(chartKey) {
    const [fid, which] = chartKey.split('.');
    const fuel = FUELS.find((f) => f.id === fid);
    if (!fuel) return null;
    if (which === 'main') return () => renderFuelMainChart(fuel);
    if (which === 'year') return () => renderFuelYearChart(fuel);
    if (which === 'month') return () => renderFuelMonthChart(fuel);
    return null;
  }

  function initChartTypeToggles() {
    document.querySelectorAll('.chart-type-toggle').forEach((group) => {
      const chartKey = group.dataset.chart;
      if (!chartKey) return;
      group.querySelectorAll('.ctt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('ctt-btn--active')) return;
          state.chartType[chartKey] = btn.dataset.type;
          group.querySelectorAll('.ctt-btn').forEach((b) => b.classList.remove('ctt-btn--active'));
          btn.classList.add('ctt-btn--active');
          const renderFn = rendererFor(chartKey);
          if (renderFn) renderFn();
          // keep an open modal for this same chart in sync
          if (modalState.open && modalState.chartKey === chartKey) {
            syncModalToggle(chartKey);
            renderModalChart(chartKey);
          }
        });
      });
    });
  }

  /* ================================================================
     FULLSCREEN CHART MODAL (⛶ ขยายกราฟ) — reuses the SAME dataset;
     clones the already-rendered Chart.js config into a bigger canvas.
     ================================================================ */

  const modalState = { open: false, chartKey: null };
  let modalChart = null;

  function syncModalToggle(chartKey) {
    const toggle = el('chartModalToggle');
    if (!toggle) return;
    const current = state.chartType[chartKey] || 'line';
    toggle.querySelectorAll('.ctt-btn').forEach((b) => {
      b.classList.toggle('ctt-btn--active', b.dataset.type === current);
    });
  }

  function renderModalChart(chartKey) {
    const canvas = el('chartModalCanvas');
    const src = charts[chartKey];
    if (!src || !canvas) return;
    if (modalChart) { modalChart.destroy(); modalChart = null; }
    modalChart = new Chart(canvas, {
      type: src.config.type,
      data: src.config.data,
      options: { ...src.config.options, maintainAspectRatio: false },
    });
  }

  function openChartModal(chartKey, triggerBtn) {
    const overlay = el('chartModalOverlay');
    if (!overlay) return;

    const card = triggerBtn ? triggerBtn.closest('.chart-card') : null;
    const titleEl = card ? card.querySelector('.cc-title') : null;
    const subEl = card ? card.querySelector('.cc-sub') : null;
    const titleTextEl = el('chartModalTitleText');
    const subTextEl = el('chartModalSub');
    if (titleTextEl) titleTextEl.textContent = titleEl ? titleEl.textContent.trim() : 'กราฟ';
    if (subTextEl) subTextEl.textContent = subEl ? subEl.textContent.trim() : UNIT;

    const isMain = chartKey.endsWith('.main');
    const toggleWrap = el('chartModalToggle') ? el('chartModalToggle').parentElement : null;
    const yearPillsContainer = el('chartModalYearPills');

    // Show/hide toggle and year pills based on chart type
    if (toggleWrap) toggleWrap.style.display = isMain ? '' : 'none';
    if (yearPillsContainer) {
      yearPillsContainer.innerHTML = '';
      if (isMain) {
        buildModalYearPills(chartKey, yearPillsContainer);
        yearPillsContainer.style.display = '';
      } else {
        yearPillsContainer.style.display = 'none';
      }
    }

    modalState.open = true;
    modalState.chartKey = chartKey;
    syncModalToggle(chartKey);
    renderModalChart(chartKey);

    overlay.classList.add('chart-modal-overlay--open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function buildModalYearPills(chartKey, container) {
    const [fid] = chartKey.split('.');
    DataStore.YEARS.forEach((year) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'year-pill';
      btn.dataset.year = year;
      btn.textContent = year;
      const isActive = state.selectedYears[fid].includes(year);
      btn.classList.toggle('year-pill--active', isActive);
      btn.addEventListener('click', () => {
        toggleYear(fid, year);
        // Sync modal pills visual
        syncModalYearPills(chartKey);
        // Sync card pills visual
        syncPillVisuals(fid);
        // Re-render both card chart and modal chart
        const fuel = FUELS.find((f) => f.id === fid);
        if (fuel) renderFuelMainChart(fuel);
        renderModalChart(chartKey);
      });
      container.appendChild(btn);
    });
  }

  function syncModalYearPills(chartKey) {
    const container = el('chartModalYearPills');
    if (!container) return;
    const [fid] = chartKey.split('.');
    const sel = state.selectedYears[fid];
    container.querySelectorAll('.year-pill').forEach((btn) => {
      btn.classList.toggle('year-pill--active', sel.includes(btn.dataset.year));
    });
  }

  function closeChartModal() {
    const overlay = el('chartModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('chart-modal-overlay--open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    modalState.open = false;
    modalState.chartKey = null;
    if (modalChart) { modalChart.destroy(); modalChart = null; }
  }

  function initChartModal() {
    document.querySelectorAll('.chart-expand-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chartKey = btn.dataset.expand;
        if (chartKey) openChartModal(chartKey, btn);
      });
    });

    const overlay = el('chartModalOverlay');
    const closeBtn = el('chartModalClose');
    const modal = overlay ? overlay.querySelector('.chart-modal') : null;
    const toggle = el('chartModalToggle');

    if (closeBtn) closeBtn.addEventListener('click', closeChartModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeChartModal(); // click on backdrop only
      });
    }
    if (modal) modal.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalState.open) closeChartModal();
    });

    if (toggle) {
      toggle.querySelectorAll('.ctt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const chartKey = modalState.chartKey;
          if (!chartKey || btn.classList.contains('ctt-btn--active')) return;
          state.chartType[chartKey] = btn.dataset.type;
          syncModalToggle(chartKey);
          // keep the underlying (non-modal) card chart + its own toggle button in sync
          const cardGroup = document.querySelector(`.chart-type-toggle[data-chart="${chartKey}"]`);
          if (cardGroup) {
            cardGroup.querySelectorAll('.ctt-btn').forEach((b) => b.classList.toggle('ctt-btn--active', b.dataset.type === btn.dataset.type));
          }
          const renderFn = rendererFor(chartKey);
          if (renderFn) renderFn();
          renderModalChart(chartKey);
        });
      });
    }
  }

  /* ================================================================
     TABLE TABS
     ================================================================ */

  function initTableTabs() {
    const tabs = el('tableTabs');
    if (!tabs) return;
    tabs.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tableFilter = btn.dataset.filter || 'all';
        tabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('tab-btn--active', b === btn));
        renderTable();
      });
    });
  }

  /* ================================================================
     FOOTER
     ================================================================ */

  function updateFooter() {
    const lastUpdateEl = el('footerLastUpdate');
    const coverageEl = el('footerCoverage');
    const recordsEl = el('footerRecords');

    if (lastUpdateEl) lastUpdateEl.textContent = `${DataStore.MONTHS_TH[DataStore.LATEST.monthIndex]} ${DataStore.LATEST.year}`;
    if (coverageEl) coverageEl.textContent = `${DataStore.YEARS[0]}–${DataStore.YEARS[DataStore.YEARS.length - 1]}`;
    if (recordsEl) {
      let count = 0;
      ['ethanol_production', 'ethanol_consumption', 'biodiesel_production', 'biodiesel_consumption'].forEach((key) => {
        DataStore.YEARS.forEach((year) => {
          for (let i = 0; i < 12; i++) {
            if (DataStore.RAW_DATA[key][year][i] !== null) count++;
          }
        });
      });
      recordsEl.textContent = `${count} รายการ`;
    }
  }

  /* ================================================================
     PER-FUEL RENDERERS
     ================================================================ */

  function updateCoverageFooter(fuel) {
    const covEl = el(`${fuel.id}Coverage`);
    if (covEl) covEl.textContent = `${rangeYearText()} · ${rangeMonthText()}`;
  }

  function updateFuelKpis(fuel) {
    const P = `${fuel.id}`;
    const prodVal = rangeAllAvg(fuel.prodKey);
    const consVal = rangeAllAvg(fuel.consKey);
    const yoyProd = trendPct(fuel.prodKey);
    const yoyCons = trendPct(fuel.consKey);

    const setVal = (id, v) => {
      const e = el(id);
      if (e) e.innerHTML = `${fmt(v)}<span class="unit">ล้านลิตร/วัน</span>`;
    };

    setVal(`${P}ValProd`, prodVal);
    setTrendEl(`${P}TrendProd`, yoyProd);
    setVal(`${P}ValCons`, consVal);
    setTrendEl(`${P}TrendCons`, yoyCons);

    // Supply-Demand difference (production − consumption), derived from the
    // same two averages already computed above — no new data source.
    if (prodVal !== null && consVal !== null) {
      const diff = prodVal - consVal;
      const diffEl = el(`${P}ValDiff`);
      if (diffEl) {
        const sign = diff >= 0 ? '+' : '';
        diffEl.innerHTML = `${sign}${fmt(diff)}<span class="unit">ล้านลิตร/วัน</span>`;
      }
      // trend on the diff card reuses production's YoY as a proxy direction indicator
      setTrendEl(`${P}TrendDiff`, diff >= 0 ? Math.abs(yoyProd ?? 0) : -Math.abs(yoyProd ?? 0));

    }
  }

  /**
   * Main trend chart — Multi-series single canvas.
   * Each selected year gets its own pair of datasets (production + consumption).
   * Area fill with transparent background. Y axis fixed 0–7.0.
   */
  function renderFuelMainChart(fuel) {
    const canvas = el(`${fuel.id}MainChart`);
    if (!canvas) return;

    const years = getTrendYears(fuel.id);
    const labels = rangeLabels();
    const chartKey = `${fuel.id}.main`;
    const type = state.chartType[chartKey] || 'line';
    const isBar = type === 'bar';
    const n = years.length;

    const yearSeries = {};
    years.forEach((y) => {
      yearSeries[y] = { prod: rangeSeries(fuel.prodKey, y), cons: rangeSeries(fuel.consKey, y) };
    });

    const datasets = [];
    years.forEach((y, idx) => {
      const shadeAmt = n > 1 ? (idx / (n - 1) - 0.5) * 0.55 : 0;
      const prodColor = shade(fuel.prodColor, shadeAmt);
      const consColor = shade(fuel.consColor, shadeAmt);

      datasets.push({
        label: `การผลิต ${y}`,
        data: yearSeries[y].prod,
        meta: { year: y, mode: 'prod' },
        borderColor: prodColor,
        backgroundColor: isBar ? prodColor : hexToRgba(prodColor, 0.12),
        hoverBackgroundColor: isBar ? hexToRgba(prodColor, 0.85) : undefined,
        fill: !isBar,
        tension: 0.3,
        borderWidth: isBar ? 0 : 2,
        borderRadius: isBar ? 5 : 0,
        maxBarThickness: isBar ? Math.max(8, 26 - n * 3) : undefined,
        categoryPercentage: 0.65,
        barPercentage: 0.85,
        borderDash: undefined,
        pointStyle: 'circle',
        pointRadius: isBar ? 0 : (n > 3 ? 2 : 3),
        pointHoverRadius: isBar ? 0 : 7,
        pointBackgroundColor: prodColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        spanGaps: false,
      });
      datasets.push({
        label: `การใช้ ${y}`,
        data: yearSeries[y].cons,
        meta: { year: y, mode: 'cons' },
        borderColor: consColor,
        backgroundColor: isBar ? consColor : hexToRgba(consColor, 0.08),
        hoverBackgroundColor: isBar ? hexToRgba(consColor, 0.85) : undefined,
        fill: !isBar,
        tension: 0.3,
        borderWidth: isBar ? 0 : 2,
        borderRadius: isBar ? 5 : 0,
        maxBarThickness: isBar ? Math.max(8, 26 - n * 3) : undefined,
        categoryPercentage: 0.65,
        barPercentage: 0.85,
        borderDash: isBar ? undefined : [6, 4],
        pointStyle: 'circle',
        pointRadius: isBar ? 0 : (n > 3 ? 2 : 3),
        pointHoverRadius: isBar ? 0 : 7,
        pointBackgroundColor: consColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        spanGaps: false,
      });
    });

    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(canvas, {
      type: isBar ? 'bar' : 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: {
              color: textColor(), usePointStyle: true, pointStyle: 'circle',
              padding: n > 2 ? 7 : 12, boxWidth: 8, boxHeight: 8,
              font: { family: "'Poppins','Kanit',sans-serif", size: n > 2 ? 10.5 : 12 },
            },
          },
          tooltip: {
            ...tooltipConfig(fuel.prodColor),
            callbacks: {
              title(items) { return fullMonthName(items[0].dataIndex); },
              label(item) {
                const meta = item.dataset.meta;
                const modeLabel = meta.mode === 'prod' ? 'การผลิต' : 'การใช้';
                return `ปี ${meta.year} · ${modeLabel}: ${fmt(item.raw)} ${UNIT}`;
              },
              footer(items) {
                const i = items[0].dataIndex;
                return years.map((y) => {
                  const p = yearSeries[y].prod[i];
                  const c = yearSeries[y].cons[i];
                  const g = (p !== null && c !== null) ? p - c : null;
                  return `Supply Gap ${y}: ${fmt(g)} ${UNIT}`;
                });
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: dimColor(), font: { size: 12.5 } }, grid: { color: borderColor() } },
          y: {
            min: 0,
            max: 7.0,
            ticks: { color: dimColor(), font: { size: 12.5 }, stepSize: 1 },
            grid: { color: borderColor() },
            title: { display: true, text: UNIT, color: dimColor(), font: { size: 12.5 } },
          },
        },
        animation: { duration: 700, easing: 'easeOutQuart' },
      },
    });
  }

  function renderFuelYearChart(fuel) {
    const canvas = el(`${fuel.id}YearChart`);
    if (!canvas) return;

    const years = getYears();
    const labels = years.map((y) => `ปี ${y}`);
    const prodData = years.map((y) => rangeAvg(fuel.prodKey, y));
    const consData = years.map((y) => rangeAvg(fuel.consKey, y));

    const chartKey = `${fuel.id}.year`;
    const type = state.chartType[chartKey] || 'bar';
    const isBar = type === 'bar';
    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(canvas, {
      type: isBar ? 'bar' : 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'การผลิต',
            data: prodData,
            borderColor: fuel.prodColor,
            backgroundColor: isBar ? fuel.prodColor : hexToRgba(fuel.prodColor, 0.1),
            hoverBackgroundColor: hexToRgba(fuel.prodColor, 0.85),
            borderRadius: isBar ? 6 : 0,
            maxBarThickness: 26,
            borderWidth: isBar ? 0 : 2,
            fill: false,
            tension: 0,
            pointRadius: isBar ? 0 : 5,
            pointHoverRadius: isBar ? 0 : 8,
            pointBackgroundColor: fuel.prodColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          },
          {
            label: 'การใช้',
            data: consData,
            borderColor: fuel.consColor,
            backgroundColor: isBar ? fuel.consColor : hexToRgba(fuel.consColor, 0.08),
            hoverBackgroundColor: hexToRgba(fuel.consColor, 0.85),
            borderRadius: isBar ? 6 : 0,
            maxBarThickness: 26,
            borderWidth: isBar ? 0 : 2,
            borderDash: isBar ? undefined : [6, 4],
            fill: false,
            tension: 0,
            pointRadius: isBar ? 0 : 5,
            pointHoverRadius: isBar ? 0 : 8,
            pointBackgroundColor: fuel.consColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor(), usePointStyle: true, pointStyle: 'rectRounded', padding: 12, font: { family: "'Poppins','Kanit',sans-serif", size: 12 } },
          },
          tooltip: {
            ...tooltipConfig(fuel.prodColor),
            callbacks: {
              title(items) { return `${fuel.name} · ${items[0].label} · ${rangeMonthText()}`; },
              label(item) { return `${item.dataset.label}: ${fmt(item.raw)} ${UNIT}`; },
              footer(items) {
                const i = items[0].dataIndex;
                const y = years[i];
                const g = gapOfYear(fuel.prodKey, fuel.consKey, y);
                return `Supply Gap: ${fmt(g)} ${UNIT}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: dimColor(), font: { size: 13 } } },
          y: { min: 0, max: 7.0, ticks: { color: dimColor(), font: { size: 13 }, stepSize: 1 }, grid: { color: borderColor() }, title: { display: true, text: UNIT, color: dimColor(), font: { size: 13 } } },
        },
        animation: { duration: 700, easing: 'easeOutQuart' },
      },
    });
  }

  function renderFuelMonthChart(fuel) {
    const canvas = el(`${fuel.id}MonthChart`);
    if (!canvas) return;

    const year = state.monthYear[fuel.id] || getYears()[getYears().length - 1];
    const labels = rangeLabels();
    const prodData = rangeSeries(fuel.prodKey, year);
    const consData = rangeSeries(fuel.consKey, year);

    const chartKey = `${fuel.id}.month`;
    const type = state.chartType[chartKey] || 'bar';
    const isBar = type === 'bar';
    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(canvas, {
      type: isBar ? 'bar' : 'line',
      data: {
        labels,
        datasets: [
          {
            label: `การผลิต ${year}`,
            data: prodData,
            borderColor: fuel.prodColor,
            backgroundColor: isBar ? fuel.prodColor : hexToRgba(fuel.prodColor, 0.1),
            hoverBackgroundColor: hexToRgba(fuel.prodColor, 0.85),
            borderRadius: isBar ? 5 : 0,
            maxBarThickness: 20,
            borderWidth: isBar ? 0 : 2,
            fill: false,
            tension: 0,
            pointRadius: isBar ? 0 : 4,
            pointHoverRadius: isBar ? 0 : 7,
            pointBackgroundColor: fuel.prodColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            spanGaps: false,
          },
          {
            label: `การใช้ ${year}`,
            data: consData,
            borderColor: fuel.consColor,
            backgroundColor: isBar ? fuel.consColor : hexToRgba(fuel.consColor, 0.08),
            hoverBackgroundColor: hexToRgba(fuel.consColor, 0.85),
            borderRadius: isBar ? 5 : 0,
            maxBarThickness: 20,
            borderWidth: isBar ? 0 : 2,
            borderDash: isBar ? undefined : [6, 4],
            fill: false,
            tension: 0,
            pointRadius: isBar ? 0 : 4,
            pointHoverRadius: isBar ? 0 : 7,
            pointBackgroundColor: fuel.consColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor(), usePointStyle: true, pointStyle: 'rectRounded', padding: 10, font: { family: "'Poppins','Kanit',sans-serif", size: 11.5 } },
          },
          tooltip: {
            ...tooltipConfig(fuel.prodColor),
            callbacks: {
              title(items) {
                const i = items[0].dataIndex;
                return `${fuel.name} · ${fullMonthName(i)} ${year}`;
              },
              label(item) { return `${item.dataset.label}: ${fmt(item.raw)} ${UNIT}`; },
              footer(items) {
                const i = items[0].dataIndex;
                const p = prodData[i];
                const c = consData[i];
                const g = (p !== null && c !== null) ? p - c : null;
                return `Supply Gap: ${fmt(g)} ${UNIT}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: dimColor(), font: { size: 12 } } },
          y: { min: 0, max: 7.0, ticks: { color: dimColor(), font: { size: 12 }, stepSize: 1 }, grid: { color: borderColor() }, title: { display: true, text: UNIT, color: dimColor(), font: { size: 12 } } },
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
      },
    });
  }

  /* ================================================================
     DATA TABLE — shared, searchable + sortable + fuel-type tabs
     ================================================================ */

  const tableState = { col: 0, dir: 1, initialized: false };

  const FUEL_BY_ID = {
    eth: { name: 'เอทานอล', en: 'Ethanol', prodKey: 'ethanol_production', consKey: 'ethanol_consumption' },
    bio: { name: 'ไบโอดีเซล (B100)', en: 'Biodiesel', prodKey: 'biodiesel_production', consKey: 'biodiesel_consumption' },
  };

  function buildRows() {
    const rows = [];
    Object.keys(FUEL_BY_ID).forEach((fid) => {
      if (state.tableFilter !== 'all' && state.tableFilter !== fid) return;
      const cfg = FUEL_BY_ID[fid];
      const years = getYears();
      const { s, e } = monthRange();
      years.forEach((year) => {
        const yi = DataStore.YEARS.indexOf(year);
        for (let i = s; i <= e; i++) {
          const p = DataStore.RAW_DATA[cfg.prodKey][year][i];
          const c = DataStore.RAW_DATA[cfg.consKey][year][i];
          const gap = (p !== null && c !== null) ? p - c : null;
          rows.push({ fid, fuelName: cfg.name, month: DataStore.MONTHS_TH[i], fullMonth: FULL_MONTHS[i], year, yi, i, p, c, gap });
        }
      });
    });
    return rows;
  }

  function renderTable() {
    const tbody = el('monthlyTableBody');
    if (!tbody) return;
    let rows = buildRows();

    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => r.month.toLowerCase().includes(q) || r.fullMonth.toLowerCase().includes(q) || r.year.includes(q));
    }

    rows.sort((a, b) => {
      if (tableState.col === 0) return (a.i - b.i) * tableState.dir;
      if (tableState.col === 1) return (a.year.localeCompare(b.year, 'th')) * tableState.dir;
      if (tableState.col === 2) return (a.fuelName.localeCompare(b.fuelName, 'th')) * tableState.dir;
      const key = tableState.col === 3 ? 'p' : (tableState.col === 4 ? 'c' : 'gap');
      const av = a[key];
      const bv = b[key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * tableState.dir;
    });

    const fmtCell = (v) => (v === null || v === undefined) ? '—' : `<b>${fmt(v, 3)}</b>`;
    const fmtGapBadge = (v, cls) => (v === null || v === undefined)
      ? '—'
      : `<span class="gap-badge ${cls}">${v >= 0 ? '+' : ''}${fmt(v, 3)}</span>`;
    // Row identity color (which fuel this row belongs to) — kept for the
    // "ประเภท" cell only. Production/Consumption/Supply-Gap cells now use
    // fixed meaning-based colors (green/orange/blue) per column, not per fuel.
    const fuelColor = (fid) => (fid === 'eth' ? '#2563EB' : '#2E7D32');

    tbody.innerHTML = rows.map((r) => {
      const gapPositive = r.gap === null ? null : r.gap >= 0;
      const gapClass = gapPositive === null ? '' : (gapPositive ? 'gap-pos' : 'gap-neg');
      return `<tr>
        <td>${r.fullMonth}</td>
        <td><b>${r.year}</b></td>
        <td><span class="td-dot" style="background:${fuelColor(r.fid)}"></span><span style="color:${fuelColor(r.fid)};font-weight:600">${r.fuelName}</span></td>
        <td class="td-prod">${fmtCell(r.p)}</td>
        <td class="td-cons">${fmtCell(r.c)}</td>
        <td class="td-gap">${fmtGapBadge(r.gap, gapClass)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="loading-row">ไม่พบข้อมูล</td></tr>`;
  }

  function initTableSort() {
    if (tableState.initialized) return;
    const thead = document.querySelector('#monthlyPerformanceTable thead');
    if (!thead) return;
    tableState.initialized = true;
    thead.querySelectorAll('th').forEach((th, idx) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        if (tableState.col === idx) {
          tableState.dir = tableState.dir === 1 ? -1 : 1;
        } else {
          tableState.col = idx;
          tableState.dir = 1;
        }
        renderTable();
        const arrow = tableState.dir === 1 ? ' ↑' : ' ↓';
        thead.querySelectorAll('th').forEach((h) => {
          h.innerHTML = h.innerHTML.replace(/[↑↓]$/, '');
        });
        th.innerHTML += arrow;
      });
    });
  }

  function initTableSearch() {
    const input = el('tableSearchInput');
    if (!input) return;
    input.addEventListener('input', () => {
      state.search = input.value;
      renderTable();
    });
  }

  /* ================================================================
     ORCHESTRATION
     ================================================================ */

  function renderAll() {
    updateFooter();
    FUELS.forEach((fuel) => {
      updateCoverageFooter(fuel);
      updateFuelKpis(fuel);
      renderFuelMainChart(fuel);
      renderFuelYearChart(fuel);
      renderFuelMonthChart(fuel);
    });
    renderTable();
  }

  function init() {
    initFilterBar();
    initMonthYearSelectors();
    initYearPills();
    initChartTypeToggles();
    initChartModal();
    clampMonthYears();
    initTableTabs();
    initTableSort();
    initTableSearch();
    renderAll();

    document.addEventListener('theme:changed', () => { renderAll(); if (modalState.open) renderModalChart(modalState.chartKey); });
    const themeSwitch = el('themeSwitch');
    if (themeSwitch) {
      themeSwitch.addEventListener('change', () => setTimeout(() => {
        renderAll();
        if (modalState.open) renderModalChart(modalState.chartKey);
      }, 60));
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        Object.values(charts).forEach((c) => c && c.resize());
      }, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
