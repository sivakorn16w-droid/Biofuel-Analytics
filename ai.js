/*
 * ai.js — Gemini AI integration for the dashboard.
 * The browser sends data to a local backend endpoint only.
 */

(() => {
  const GEMINI_LOADING_TEXT = 'Gemini กำลังวิเคราะห์ข้อมูล...';

  function clampRange(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? fallback : n;
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
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    return months.slice(s, e + 1);
  }

  function buildFuelSeries(prodKey, consKey) {
    const years = getSelectedYears();
    const { monthStart, monthEnd } = window.state || {};
    const start = clampRange(monthStart, 0);
    const end = clampRange(monthEnd, 11);
    const startIndex = Math.min(start, end);
    const endIndex = Math.max(start, end);

    const production = [];
    const consumption = [];
    const supplyGap = [];

    years.forEach((year) => {
      const prodRow = DataStore.RAW_DATA[prodKey]?.[year] || [];
      const consRow = DataStore.RAW_DATA[consKey]?.[year] || [];
      for (let i = startIndex; i <= endIndex; i++) {
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
    const { monthStart, monthEnd } = window.state || {};
    const start = clampRange(monthStart, 0);
    const end = clampRange(monthEnd, 11);
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
        for (let i = startIndex; i <= endIndex; i++) {
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
        supplyGap: (pCount && cCount) ? (totalProd / pCount) - (totalCons / cCount) : null,
      };
    };

    return {
      ethanol: avgForFuel('ethanol_production', 'ethanol_consumption'),
      biodiesel: avgForFuel('biodiesel_production', 'biodiesel_consumption')
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
      ethanol: {
        production: ethanol.production,
        consumption: ethanol.consumption,
        supplyGap: ethanol.supplyGap,
      },
      biodiesel: {
        production: biodiesel.production,
        consumption: biodiesel.consumption,
        supplyGap: biodiesel.supplyGap,
      },
      kpis: {
        ethanol: {
          production: kpis.ethanol.production,
          consumption: kpis.ethanol.consumption,
          supplyGap: kpis.ethanol.supplyGap,
        },
        biodiesel: {
          production: kpis.biodiesel.production,
          consumption: kpis.biodiesel.consumption,
          supplyGap: kpis.biodiesel.supplyGap,
        },
      },
    };
  }

  function analyzeDashboardData(data, filters = {}) {
    const years = Array.isArray(data?.filters?.selectedYears) && data.filters.selectedYears.length
      ? data.filters.selectedYears
      : getSelectedYears();

    if (!years.length) {
      return {
        summary: 'ไม่พบข้อมูลในช่วงที่เลือก',
        productionTrend: 'ไม่สามารถสรุปแนวโน้มการผลิตได้จากช่วงข้อมูลที่เลือก',
        consumptionTrend: 'ไม่สามารถสรุปแนวโน้มการใช้ได้จากช่วงข้อมูลที่เลือก',
        supplyGap: 'ไม่สามารถประเมิน Supply Gap ได้จากช่วงข้อมูลที่เลือก',
        highest: 'ไม่มีข้อมูลที่เพียงพอ',
        lowest: 'ไม่มีข้อมูลที่เพียงพอ',
        attention: ['ข้อมูลที่เลือกไม่เพียงพอสำหรับการวิเคราะห์'],
      };
    }

    const buildText = (label, value) => `${label}: ${Number.isFinite(value) ? value.toFixed(3) : '—'}`;
    const ethProd = data.ethanol?.production || [];
    const ethCons = data.ethanol?.consumption || [];
    const bioProd = data.biodiesel?.production || [];
    const bioCons = data.biodiesel?.consumption || [];

    const getNumericValues = (series) => series
      .map((item) => Number(item?.value))
      .filter((value) => Number.isFinite(value));

    const ethProdValues = getNumericValues(ethProd);
    const ethConsValues = getNumericValues(ethCons);
    const bioProdValues = getNumericValues(bioProd);
    const bioConsValues = getNumericValues(bioCons);

    const highestEth = Math.max(...ethProdValues, 0);
    const lowestEth = Math.min(...ethProdValues, 0);
    const highestBio = Math.max(...bioProdValues, 0);
    const lowestBio = Math.min(...bioProdValues, 0);

    return {
      summary: [
        `ช่วงข้อมูล ${filters.yearStart || data.filters?.yearStart || years[0]}–${filters.yearEnd || data.filters?.yearEnd || years[years.length - 1]} · ${filters.monthStart || data.filters?.monthStart || 'ม.ค.'}–${filters.monthEnd || data.filters?.monthEnd || 'ธ.ค.'}`,
        `เอทานอลมีค่าเฉลี่ยการผลิต ${ethProdValues.length ? (ethProdValues.reduce((sum, v) => sum + v, 0) / ethProdValues.length).toFixed(3) : '—'} ล้านลิตร/วัน และค่าเฉลี่ยการใช้ ${ethConsValues.length ? (ethConsValues.reduce((sum, v) => sum + v, 0) / ethConsValues.length).toFixed(3) : '—'} ล้านลิตร/วัน`,
        `ไบโอดีเซลมีค่าเฉลี่ยการผลิต ${bioProdValues.length ? (bioProdValues.reduce((sum, v) => sum + v, 0) / bioProdValues.length).toFixed(3) : '—'} ล้านลิตร/วัน และค่าเฉลี่ยการใช้ ${bioConsValues.length ? (bioConsValues.reduce((sum, v) => sum + v, 0) / bioConsValues.length).toFixed(3) : '—'} ล้านลิตร/วัน`,
      ].join(' '),
      productionTrend: `แนวโน้มการผลิตระหว่าง ${years[0]}–${years[years.length - 1]} แสดงให้เห็นว่าเอทานอลมีช่วงผลิตสูงสุด ${highestEth.toFixed(3)} และไบโอดีเซลมีช่วงผลิตสูงสุด ${highestBio.toFixed(3)} ล้านลิตร/วัน`,
      consumptionTrend: `แนวโน้มการใช้ระหว่าง ${years[0]}–${years[years.length - 1]} แสดงถึงอัตราการใช้ที่สูงสุดในเอทานอล ${Math.max(...ethConsValues, 0).toFixed(3)} และไบโอดีเซล ${Math.max(...bioConsValues, 0).toFixed(3)} ล้านลิตร/วัน`,
      supplyGap: `Supply Gap ยังคงมีความแตกต่างระหว่างการผลิตกับการใช้ โดยเอทานอล ${((highestEth - Math.max(...ethConsValues, 0))).toFixed(3)} และไบโอดีเซล ${((highestBio - Math.max(...bioConsValues, 0))).toFixed(3)} ล้านลิตร/วัน`,
      highest: `เอทานอลสูงสุด ${highestEth.toFixed(3)} · ไบโอดีเซลสูงสุด ${highestBio.toFixed(3)} ล้านลิตร/วัน`,
      lowest: `เอทานอลต่ำสุด ${lowestEth.toFixed(3)} · ไบโอดีเซลต่ำสุด ${lowestBio.toFixed(3)} ล้านลิตร/วัน`,
      attention: [
        'ตรวจสอบความผันผวนของการผลิตเมื่อมีการเปลี่ยนแปลงของสภาวะตลาด',
        'เฝ้าติดตาม Supply Gap ของทั้งสองประเภท เพื่อป้องกันความไม่สมดุลระหว่างอุปทานและอุปสงค์',
      ],
    };
  }

  async function requestAIAnalysis(payload) {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'ไม่สามารถวิเคราะห์ข้อมูลได้');
    }

    return response.json();
  }

  function renderAiResult(result) {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    const summary = result?.summary || 'ไม่มีสรุปข้อมูล';
    const productionTrend = result?.productionTrend || 'ไม่มีข้อมูลแนวโน้มการผลิต';
    const consumptionTrend = result?.consumptionTrend || 'ไม่มีข้อมูลแนวโน้มการใช้';
    const supplyGap = result?.supplyGap || 'ไม่มีข้อมูล Supply Gap';
    const highest = result?.highest || 'ไม่มีข้อมูล';
    const lowest = result?.lowest || 'ไม่มีข้อมูล';
    const attention = Array.isArray(result?.attention) && result.attention.length ? result.attention : ['ไม่มีข้อมูลจุดที่ควรจับตามอง'];

    content.innerHTML = `
      <div class="ai-result-block">
        <div class="ai-range-pill"><i class="fa-solid fa-calendar-days"></i> ${result?.rangeLabel || 'ช่วงข้อมูลที่เลือก'}</div>

        <div class="ai-section">
          <div class="ai-section-head"><span>💡</span> ภาพรวม</div>
          <div class="ai-section-body">${summary}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>📈</span> แนวโน้มการผลิต</div>
          <div class="ai-section-body">${productionTrend}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>📊</span> แนวโน้มการใช้</div>
          <div class="ai-section-body">${consumptionTrend}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>⚖️</span> Supply Gap</div>
          <div class="ai-section-body">${supplyGap}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>🏆</span> ค่าสูงสุด</div>
          <div class="ai-section-body">${highest}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>📉</span> ค่าต่ำสุด</div>
          <div class="ai-section-body">${lowest}</div>
        </div>

        <div class="ai-section">
          <div class="ai-section-head"><span>⚠️</span> จุดที่ควรจับตามอง</div>
          <div class="ai-section-body">${attention.map((item) => `<div>• ${item}</div>`).join('')}</div>
        </div>
      </div>
    `;
  }

  function renderAiError(message = 'ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้') {
    const content = document.getElementById('aiModalContent');
    if (!content) return;

    content.innerHTML = `
      <div class="ai-error">
        <div class="ai-error-box"><i class="fa-solid fa-triangle-exclamation"></i> ${message}</div>
        <button class="ai-retry-btn" type="button" id="aiRetryBtn">ลองอีกครั้ง</button>
      </div>
    `;

    const retry = document.getElementById('aiRetryBtn');
    if (retry) {
      retry.addEventListener('click', openAiModal);
    }
  }

  function openAiModal() {
    const overlay = document.getElementById('aiModalOverlay');
    const content = document.getElementById('aiModalContent');
    if (!overlay || !content) return;

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    content.innerHTML = `<div class="ai-loading"><span class="ai-loading-spinner"></span><span>${GEMINI_LOADING_TEXT}</span></div>`;

    const payload = buildAIRequestPayload();
    payload.rangeLabel = `${payload.filters.yearStart}–${payload.filters.yearEnd} · ${payload.filters.selectedMonths[0]}–${payload.filters.selectedMonths[payload.filters.selectedMonths.length - 1]}`;

    requestAIAnalysis(payload)
      .then((result) => {
        const normalized = {
          ...result,
          rangeLabel: payload.rangeLabel,
        };
        renderAiResult(normalized);
      })
      .catch((error) => {
        renderAiError(error.message || 'ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้');
      });
  }

  function closeAiModal() {
    const overlay = document.getElementById('aiModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function bindAiButton() {
    const btn = document.getElementById('aiAnalysisBtn');
    const closeBtn = document.getElementById('aiModalClose');
    const overlay = document.getElementById('aiModalOverlay');

    if (btn) btn.addEventListener('click', openAiModal);
    if (closeBtn) closeBtn.addEventListener('click', closeAiModal);
    if (overlay) {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAiModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
        closeAiModal();
      }
    });
  }

  function bootstrap() {
    if (typeof DataStore === 'undefined') return;
    if (typeof window !== 'undefined') {
      window.state = window.state || {};
      window.analyzeDashboardData = analyzeDashboardData;
      window.requestAIAnalysis = requestAIAnalysis;
    }
    bindAiButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
