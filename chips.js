/**
 * chips.js
 * Quick Filter Chips: filters KPI cards + data table rows.
 * - Year chips: single-select
 * - Fuel chips: multi-select
 * - Mode chips: multi-select
 * - "ทั้งหมด" resets everything
 * - "ล่าสุด" / "ปีล่าสุด" jump to latest reported year (2569)
 */

(() => {
  const LATEST_YEAR = '2569';

  const state = {
    year: null,        // null = all years
    fuels: new Set(),  // empty = all fuels
    modes: new Set(),  // empty = all modes
  };

  const chipBar = document.getElementById('chipBar');
  if (!chipBar) return;

  const allChips = Array.from(chipBar.querySelectorAll('.chip'));
  const yearChips = allChips.filter((c) => c.dataset.chipType === 'year');
  const fuelChips = allChips.filter((c) => c.dataset.chipType === 'fuel');
  const modeChips = allChips.filter((c) => c.dataset.chipType === 'mode');
  const resetChips = allChips.filter((c) => c.dataset.chipType === 'reset');

  function setActive(chip, active) {
    chip.classList.toggle('chip--active', active);
  }

  function syncChipVisuals() {
    resetChips.forEach((c) => setActive(c, false));
    yearChips.forEach((c) => setActive(c, c.dataset.value === state.year));
    fuelChips.forEach((c) => setActive(c, state.fuels.has(c.dataset.value)));
    modeChips.forEach((c) => setActive(c, state.modes.has(c.dataset.value)));

    const isAllState = !state.year && state.fuels.size === 0 && state.modes.size === 0;
    if (isAllState) setActive(resetChips.find((c) => c.dataset.value === 'all'), true);
  }

  function applyFilters() {
    // ---- KPI cards ----
    document.querySelectorAll('.kpi-card[data-fuel]').forEach((card) => {
      const fuelOk = state.fuels.size === 0 || state.fuels.has(card.dataset.fuel);
      const modeOk = state.modes.size === 0 || state.modes.has(card.dataset.mode);
      const show = fuelOk && modeOk;
      card.style.display = show ? '' : 'none';
      card.classList.toggle('kpi-card--dim', !show);
    });

    // ---- data table rows ----
    document.querySelectorAll('table.data-table tbody tr[data-year]').forEach((row) => {
      const show = !state.year || row.dataset.year === state.year;
      row.style.display = show ? '' : 'none';
    });

    syncChipVisuals();
  }

  function resetAll() {
    state.year = null;
    state.fuels.clear();
    state.modes.clear();
  }

  resetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      if (v === 'all') {
        resetAll();
      } else if (v === 'latest' || v === 'latest-year') {
        resetAll();
        state.year = LATEST_YEAR;
      }
      applyFilters();
    });
  });

  yearChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      state.year = state.year === v ? null : v; // toggle off if clicking the active year
      applyFilters();
    });
  });

  fuelChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      if (state.fuels.has(v)) state.fuels.delete(v);
      else state.fuels.add(v);
      applyFilters();
    });
  });

  modeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      if (state.modes.has(v)) state.modes.delete(v);
      else state.modes.add(v);
      applyFilters();
    });
  });

  // initial state: "ทั้งหมด" active, nothing filtered
  applyFilters();
})();
