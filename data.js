/**
 * data.js — DataStore
 * All monthly data embedded directly from the 4 uploaded CSV statistics files.
 * This is the ONLY source of truth. Never use dummy or hardcoded chart values.
 *
 * Sources:
 *   1. สถิติปริมาณการผลิตเอทานอล.csv
 *   2. สถิติปริมาณการใช้เอทานอล.csv
 *   3. สถิติปริมาณการผลิตน้ำมันไบโอดีเซลประเภทเมทิลเอสเตอร์ของกรดไขมัน.csv
 *   4. สถิติปริมาณการใช้น้ำมันไบโอดีเซลประเภทเมทิลเอสเตอร์ของกรดไขมัน.csv
 *
 * Units: ล้านลิตร/วัน (million litres per day)
 */

const DataStore = (() => {
  const YEARS = ['2565', '2566', '2567', '2568', '2569'];
  const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const LATEST = { year: '2569', monthIndex: 4 }; // data through May (index 4)

  // RAW_DATA[key][year] = [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, AnnualAvg]
  // null = no data reported yet for that month
  const RAW_DATA = {
    // ===================== ETHANOL PRODUCTION =====================
    // Source: สถิติปริมาณการผลิตเอทานอล.csv
    ethanol_production: {
      '2565': [4.589, 4.790, 4.452, 4.165, 3.757, 3.894, 4.096, 3.998, 3.705, 3.480, 2.738, 3.239, 3.908],
      '2566': [4.463, 4.757, 3.949, 3.533, 2.766, 3.874, 3.775, 3.562, 3.453, 3.329, 2.540, 3.030, 3.586],
      '2567': [3.969, 4.565, 3.986, 3.608, 3.239, 3.400, 3.852, 3.251, 3.336, 3.372, 2.942, 2.870, 3.532],
      '2568': [3.604, 4.117, 3.619, 3.256, 3.508, 3.269, 3.392, 3.629, 2.980, 3.295, 3.301, 3.542, 3.459],
      '2569': [4.268, 4.471, 4.465, 4.389, 3.592, null, null, null, null, null, null, null, 4.237],
    },

    // ===================== ETHANOL CONSUMPTION =====================
    // Source: สถิติปริมาณการใช้เอทานอล.csv
    ethanol_consumption: {
      '2565': [3.993, 3.912, 3.706, 4.042, 4.013, 3.915, 3.945, 3.733, 3.778, 3.532, 3.691, 3.896, 3.846],
      '2566': [3.602, 3.578, 3.589, 3.610, 3.578, 3.559, 3.607, 3.467, 3.397, 3.307, 3.506, 3.611, 3.534],
      '2567': [3.473, 3.436, 3.364, 3.510, 3.346, 3.462, 3.365, 3.479, 3.295, 3.424, 3.486, 3.527, 3.431],
      '2568': [3.347, 3.439, 3.377, 3.523, 3.389, 3.449, 3.517, 3.432, 3.412, 3.384, 3.378, 3.580, 3.436],
      '2569': [3.479, 3.535, 3.754, 3.503, 3.613, null, null, null, null, null, null, null, 3.577],
    },

    // ===================== BIODIESEL PRODUCTION =====================
    // Source: สถิติปริมาณการผลิตน้ำมันไบโอดีเซลประเภทเมทิลเอสเตอร์ของกรดไขมัน.csv
    biodiesel_production: {
      '2565': [4.468, 3.572, 3.743, 3.542, 3.427, 3.524, 3.376, 3.056, 3.376, 4.234, 4.543, 4.854, 3.810],
      '2566': [4.562, 5.058, 4.676, 4.247, 4.259, 4.538, 4.270, 4.219, 4.363, 4.790, 4.833, 5.092, 4.576],
      '2567': [4.385, 4.755, 4.886, 4.875, 4.786, 4.905, 4.843, 4.551, 4.312, 4.214, 4.210, 3.952, 4.556],
      '2568': [3.341, 3.208, 3.798, 3.920, 4.175, 4.246, 4.310, 3.915, 3.695, 4.113, 4.455, 4.590, 3.981],
      '2569': [4.095, 4.169, 4.771, 5.197, 4.172, null, null, null, null, null, null, null, 4.481],
    },

    // ===================== BIODIESEL CONSUMPTION =====================
    // Source: สถิติปริมาณการใช้น้ำมันไบโอดีเซลประเภทเมทิลเอสเตอร์ของกรดไขมัน.csv
    biodiesel_consumption: {
      '2565': [4.498, 3.718, 3.615, 3.882, 3.387, 3.578, 3.223, 3.238, 3.191, 3.836, 4.552, 4.680, 3.783],
      '2566': [4.551, 4.574, 4.592, 4.385, 4.459, 4.261, 4.145, 4.136, 4.052, 4.176, 4.709, 4.624, 4.389],
      '2567': [4.544, 4.709, 4.789, 4.673, 4.665, 4.414, 4.397, 4.292, 4.097, 4.259, 4.323, 3.516, 4.390],
      '2568': [3.524, 3.598, 3.474, 3.556, 3.448, 3.352, 3.132, 3.153, 2.955, 3.134, 3.379, 3.475, 3.348],
      '2569': [3.423, 3.544, 4.795, 4.028, 4.738, null, null, null, null, null, null, null, 4.106],
    },
  };

  /**
   * Annual average for a given key + year.
   * Uses the pre-computed average (index 12) from the raw data.
   */
  function yearTotalAvg(key, year) {
    const row = RAW_DATA[key] && RAW_DATA[key][year];
    if (!row) return null;
    return row[12] ?? null;
  }

  /**
   * Average across ALL years for a specific month index (0-11).
   * Only considers years where data exists for that month.
   */
  function monthAvgAcrossYears(key, monthIndex) {
    let sum = 0;
    let count = 0;
    YEARS.forEach((y) => {
      const val = RAW_DATA[key][y][monthIndex];
      if (val !== null && val !== undefined) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? sum / count : null;
  }

  /**
   * Average across selected years for a specific month index.
   */
  function monthAvgForYears(key, monthIndex, years) {
    let sum = 0;
    let count = 0;
    years.forEach((y) => {
      const val = RAW_DATA[key][y][monthIndex];
      if (val !== null && val !== undefined) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? sum / count : null;
  }

  /**
   * Compute year-over-year or month-over-month percentage change.
   */
  function pctChange(current, previous) {
    if (current === null || current === undefined) return null;
    if (previous === null || previous === undefined || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  /**
   * Get the monthly values for a given key + year (12 values, null for missing).
   */
  function getMonthlyData(key, year) {
    const row = RAW_DATA[key] && RAW_DATA[key][year];
    if (!row) return Array(12).fill(null);
    return row.slice(0, 12);
  }

  /**
   * Get all years' values for a specific month index across all years.
   */
  function getYearlyDataForMonth(key, monthIndex) {
    return YEARS.map((y) => RAW_DATA[key][y][monthIndex]);
  }

  /**
   * Get the max value across all months/years for a key.
   */
  function getMaxValue(key) {
    let max = -Infinity;
    YEARS.forEach((y) => {
      for (let i = 0; i < 12; i++) {
        const v = RAW_DATA[key][y][i];
        if (v !== null && v > max) max = v;
      }
    });
    return max === -Infinity ? null : max;
  }

  /**
   * Get the month label (Thai) for a given month index.
   */
  function getMonthLabel(index) {
    return MONTHS_TH[index] || '';
  }

  /**
   * Compute YoY change for a specific month across years.
   * Returns % change from previous year's same month.
   */
  function getYoYForMonth(key, year, monthIndex) {
    const yearIdx = YEARS.indexOf(year);
    if (yearIdx <= 0) return null;
    const prevYear = YEARS[yearIdx - 1];
    const current = RAW_DATA[key][year][monthIndex];
    const previous = RAW_DATA[key][prevYear][monthIndex];
    return pctChange(current, previous);
  }

  /**
   * Compute MoM change for a specific month within a year.
   * Returns % change from previous month.
   */
  function getMoMForKeyYear(key, year, monthIndex) {
    if (monthIndex <= 0) return null;
    const current = RAW_DATA[key][year][monthIndex];
    const previous = RAW_DATA[key][year][monthIndex - 1];
    return pctChange(current, previous);
  }

  return {
    YEARS,
    MONTHS_TH,
    LATEST,
    RAW_DATA,
    yearTotalAvg,
    monthAvgAcrossYears,
    monthAvgForYears,
    pctChange,
    getMonthlyData,
    getYearlyDataForMonth,
    getMaxValue,
    getMonthLabel,
    getYoYForMonth,
    getMoMForKeyYear,
  };
})();
