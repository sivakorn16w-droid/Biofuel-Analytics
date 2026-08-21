/*
 * ai.js - Gemini AI integration for the dashboard.
 * The browser sends dashboard data to the backend endpoint only.
 */

(() => {
  const MODEL_NAME = 'Gemini 3.6 Flash';
  const MODEL_ID = 'gemini-3.6-flash';

  function clampRange(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSelectedYears() {
    const years = Array.isArray(DataStore?.YEARS) ? DataStore.YEARS : [];
    if (!years.length) return [];
    const yearStart = window.state?.yearStart || years[0];
    const yearEnd = window.state?.yearEnd || years[years.length - 1];
    const start = years.indexOf(yearStart);
    const end = years.indexOf(yearEnd);
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return years.slice(from, to + 1);
  }

  function getSelectedMonths() {
    const months = Array.isArray(DataStore?.MONTHS_TH) ? DataStore.MONTHS_TH : [];
    const start = clampRange(window.state?.monthStart, 0);
    const end = clampRange(window.state?.monthEnd, months.length - 1);
    return months.slice(Math.min(start, end), Math.max(start, end) + 1);
  }

  function buildFuelSeries(prodKey, consKey) {
    const years = getSelectedYears();
    const start = clampRange(window.state?.monthStart, 0);
    const end = clampRange(window.state?.monthEnd, 11);
    const startIndex = Math.min(start, end);
    const endIndex = Math.max(start, end);
    const production = [];
    const consumption = [];
    const supplyGap = [];

    years.forEach((year) => {
      const prodRow = DataStore.RAW_DATA[prodKey]?.[year] || [];
      const consRow = DataStore.RAW_DATA[consKey]?.[year] || [];
      for (let i = startIndex; i <= endIndex; i += 1) {
        const p = prodRow[i];
        const c = consRow[i];
        production.push({ year, monthIndex: i, value: p });
        consumption.push({ year, monthIndex: i, value: c });
        supplyGap.push({ year, monthIndex: i, value: p !== null && c !== null ? p - c : null });
      }
    });

    return { production, consumption, supplyGap };
  }

  function getCurrentKpiValues() {
    const years = getSelectedYears();
    const start = clampRange(window.state?.monthStart, 0);
    const end = clampRange(window.state?.monthEnd, 11);
    const startIndex = Math.min(start, end);
    const endIndex = Math.max(start, end);

    const avgForFuel = (prodKey, consKey) => {
      let totalProd = 0;
      let totalCons = 0;
      let pCount = 0;
      let cCount = 0;

      years.forEach((year) => {
        const prodRow = DataStore.RAW_DATA[prodKey]?.[year] || [];
        const consRow = DataStore.RAW_DATA[consKey]?.[year] || [];
        for (let i = startIndex; i <= endIndex; i += 1) {
          const p = prodRow[i];
          const c = consRow[i];
          if (p !== null && p !== undefined) {
            totalProd += p;
            pCount += 1;
          }
          if (c !== null && c !== undefined) {
            totalCons += c;
            cCount += 1;
          }
        }
      });

      return {
        production: pCount ? totalProd / pCount : null,
        consumption: cCount ? totalCons / cCount : null,
        supplyGap: pCount && cCount ? (totalProd / pCount) - (totalCons / cCount) : null,
      };
    };

    return {
      ethanol: avgForFuel('ethanol_production', 'ethanol_consumption'),
      biodiesel: avgForFuel('biodiesel_production', 'biodiesel_consumption'),
    };
  }

  function buildAIRequestPayload() {
    const selectedYears = getSelectedYears();
    const selectedMonths = getSelectedMonths();
    const yearStart = window.state?.yearStart || DataStore.YEARS[0];
    const yearEnd = window.state?.yearEnd || DataStore.YEARS[DataStore.YEARS.length - 1];
    const monthStart = window.state?.monthStart || '0';
    const monthEnd = window.state?.monthEnd || '11';
    const ethanol = buildFuelSeries('ethanol_production', 'ethanol_consumption');
    const biodiesel = buildFuelSeries('biodiesel_production', 'biodiesel_consumption');
    const kpis = getCurrentKpiValues();

    return {
      filters: {
        yearStart,
        yearEnd,
        monthStart,
        monthEnd,
        selectedYears,
        selectedMonths,
      },
      ethanol,
      biodiesel,
      kpis,
      rangeLabel: `${yearStart}-${yearEnd} · ${selectedMonths[0]}-${selectedMonths[selectedMonths.length - 1]}`,
    };
  }

  async function requestAIAnalysis(payload) {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'AI request failed');
    }

    return response.json();
  }

  function renderFilterContext(payload) {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    content.innerHTML = `
      <div class="ai-panel-start">
        <div class="ai-context-card">
          <div class="ai-context-title"><i class="fa-solid fa-chart-simple"></i> ข้อมูลที่กำลังวิเคราะห์</div>
          <div class="ai-context-grid">
            <div class="ai-context-item">
              <span class="ai-context-icon"><i class="fa-regular fa-calendar"></i></span>
              <div class="ai-context-text"><span>ช่วงปี</span><strong>${escapeHtml(payload.filters.yearStart)}-${escapeHtml(payload.filters.yearEnd)}</strong></div>
            </div>
            <div class="ai-context-item">
              <span class="ai-context-icon"><i class="fa-regular fa-clock"></i></span>
              <div class="ai-context-text"><span>ช่วงเดือน</span><strong>${escapeHtml(payload.filters.selectedMonths[0])}-${escapeHtml(payload.filters.selectedMonths[payload.filters.selectedMonths.length - 1])}</strong></div>
            </div>
            <div class="ai-context-item">
              <span class="ai-context-icon"><i class="fa-solid fa-flask"></i></span>
              <div class="ai-context-text"><span>ข้อมูล</span><strong>Ethanol + Biodiesel</strong></div>
            </div>
          </div>
        </div>
        <button class="ai-run-btn" id="aiRunBtn" type="button"><span class="ai-run-icon">✦</span> วิเคราะห์ข้อมูล</button>
      </div>
    `;

    document.getElementById('aiRunBtn')?.addEventListener('click', () => runAiAnalysis(payload));
  }

  function renderAiLoading(payload) {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    content.innerHTML = `
      <div class="ai-context-card ai-context-card--compact">
        <div class="ai-context-title"><i class="fa-solid fa-chart-simple"></i> ${escapeHtml(payload.rangeLabel)}</div>
        <div class="ai-context-note">Ethanol + Biodiesel</div>
      </div>
      <div class="ai-loading-card">
        <span class="ai-loading-orbit" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path fill="currentColor" d="M12 2c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z"/>
          </svg>
        </span>
        <strong>Gemini กำลังวิเคราะห์ข้อมูล Dashboard...</strong>
        <span>กำลังตรวจสอบแนวโน้มการผลิตและการใช้</span>
        <div class="ai-loading-dots"><i></i><i></i><i></i></div>
      </div>
    `;
  }

  function renderAiResult(result) {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    const sections = [
      ['insight', 'fa-lightbulb', 'ภาพรวม', result?.summary || 'ไม่มีสรุปข้อมูล'],
      ['production', 'fa-arrow-trend-up', 'แนวโน้มการผลิต', result?.productionTrend || 'ไม่มีข้อมูลแนวโน้มการผลิต'],
      ['consumption', 'fa-chart-column', 'แนวโน้มการใช้', result?.consumptionTrend || 'ไม่มีข้อมูลแนวโน้มการใช้'],
      ['gap', 'fa-scale-balanced', 'Supply Gap', result?.supplyGap || 'ไม่มีข้อมูล Supply Gap'],
      ['high', 'fa-trophy', 'ค่าสูงสุด', result?.highest || 'ไม่มีข้อมูล'],
      ['low', 'fa-arrow-trend-down', 'ค่าต่ำสุด', result?.lowest || 'ไม่มีข้อมูล'],
    ];
    const attention = Array.isArray(result?.attention) && result.attention.length
      ? result.attention
      : ['ไม่มีข้อมูลจุดที่ควรจับตามอง'];

    content.innerHTML = `
      <div class="ai-result-block">
        <div class="ai-quick-insight">
          <div class="ai-quick-top">
            <span class="ai-quick-icon">✨</span>
            <span class="ai-quick-label">Quick Insight</span>
          </div>
          <strong>${escapeHtml(result?.summary || 'วิเคราะห์ข้อมูล Dashboard สำเร็จ')}</strong>
          <div class="ai-range-pill"><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(result?.rangeLabel || 'ช่วงข้อมูลที่เลือก')}</div>
        </div>
        ${sections.map(([tone, icon, title, body]) => `
          <div class="ai-section ai-section--${tone}">
            <div class="ai-section-head"><span class="ai-section-icon"><i class="fa-solid ${icon}"></i></span> ${escapeHtml(title)}</div>
            <div class="ai-section-body">${escapeHtml(body)}</div>
          </div>
        `).join('')}
        <div class="ai-section ai-section--warn">
          <div class="ai-section-head"><span class="ai-section-icon"><i class="fa-solid fa-triangle-exclamation"></i></span> จุดที่ควรจับตามอง</div>
          <div class="ai-section-body ai-attention-list">${attention.map((item) => `<div class="ai-attention-item">${escapeHtml(item)}</div>`).join('')}</div>
        </div>
      </div>
    `;
  }

  function renderAiError() {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    content.innerHTML = `
      <div class="ai-error">
        <div class="ai-error-box">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>ไม่สามารถเชื่อมต่อ Gemini ได้</strong>
            <span>ไม่สามารถรับผลการวิเคราะห์จาก AI ได้ในขณะนี้</span>
          </div>
        </div>
        <button class="ai-retry-btn" type="button" id="aiRetryBtn">ลองอีกครั้ง</button>
        <p class="ai-error-hint">ตรวจสอบการเชื่อมต่อ Internet หรือ Backend API</p>
      </div>
    `;

    document.getElementById('aiRetryBtn')?.addEventListener('click', () => {
      runAiAnalysis(buildAIRequestPayload());
    });
  }

  function runAiAnalysis(payload) {
    renderAiLoading(payload);
    requestAIAnalysis(payload)
      .then((result) => renderAiResult({ ...result, rangeLabel: payload.rangeLabel }))
      .catch(() => renderAiError());
  }

  function openAiModal() {
    const overlay = document.getElementById('aiModalOverlay');
    const btn = document.getElementById('aiAnalysisBtn');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    btn?.classList.add('is-active');
    renderFilterContext(buildAIRequestPayload());
  }

  function closeAiModal() {
    const overlay = document.getElementById('aiModalOverlay');
    const btn = document.getElementById('aiAnalysisBtn');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    btn?.classList.remove('is-active');
  }

  function bindAiButton() {
    const btn = document.getElementById('aiAnalysisBtn');
    const closeBtn = document.getElementById('aiModalClose');
    const overlay = document.getElementById('aiModalOverlay');

    btn?.addEventListener('click', openAiModal);
    closeBtn?.addEventListener('click', closeAiModal);
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) closeAiModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay?.classList.contains('is-open')) {
        closeAiModal();
      }
    });
  }

  function bootstrap() {
    if (typeof DataStore === 'undefined') return;
    window.requestAIAnalysis = requestAIAnalysis;
    bindAiButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
