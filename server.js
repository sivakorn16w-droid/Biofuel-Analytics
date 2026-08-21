require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_MODEL = normalizeGeminiModel(process.env.GEMINI_MODEL);
const GEMINI_FALLBACK_MODELS = uniqueModels([
  GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
]);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

function normalizeGeminiModel(value) {
  const model = (value || DEFAULT_GEMINI_MODEL)
    .trim()
    .replace(/^GEMINI_MODEL\s*=\s*/i, '')
    .replace(/^models\//i, '')
    .trim();

  return model || DEFAULT_GEMINI_MODEL;
}

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))];
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { filters: {}, ethanol: { production: [], consumption: [], supplyGap: [] }, biodiesel: { production: [], consumption: [], supplyGap: [] } };
  }

  return {
    filters: payload.filters || {},
    ethanol: payload.ethanol || { production: [], consumption: [], supplyGap: [] },
    biodiesel: payload.biodiesel || { production: [], consumption: [], supplyGap: [] },
    kpis: payload.kpis || {},
    rangeLabel: payload.rangeLabel || '',
  };
}

function buildGeminiPrompt(payload) {
  const filters = payload.filters || {};
  const yearLabel = `${filters.yearStart || '—'}–${filters.yearEnd || '—'}`;
  const monthLabel = `${filters.monthStart || '—'}–${filters.monthEnd || '—'}`;

  return `
คุณเป็นผู้ช่วยวิเคราะห์ข้อมูลด้านเชื้อเพลิงชีวภาพของประเทศไทย

วิเคราะห์เฉพาะข้อมูลที่ได้รับจาก Dashboard เท่านั้น
ห้ามสร้างตัวเลข
ห้ามเดาตัวเลข
ห้ามใช้ข้อมูลภายนอก
ถ้าข้อมูลไม่เพียงพอให้ระบุว่าไม่สามารถสรุปได้

คำแนะนำ:
1. ภาพรวม
2. แนวโน้มการผลิต
3. แนวโน้มการใช้
4. Supply Gap
5. ค่าสูงสุด
6. ค่าต่ำสุด
7. จุดที่ควรจับตามอง

ตอบเป็นภาษาไทย กระชับ อ่านง่าย เหมาะสำหรับผู้บริหาร

ช่วงข้อมูล: ${yearLabel} · ${monthLabel}

ข้อมูล Dashboard:
${JSON.stringify(payload, null, 2)}

ตอบในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:
{
  "summary": "...",
  "productionTrend": "...",
  "consumptionTrend": "...",
  "supplyGap": "...",
  "highest": "...",
  "lowest": "...",
  "attention": ["...", "..."]
}
`;
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Set it in your environment before starting the server.');
  }

  let lastError;

  for (const model of GEMINI_FALLBACK_MODELS) {
    try {
      return await callGeminiModel(prompt, model);
    } catch (error) {
      lastError = error;

      if (!error.retryable) {
        throw error;
      }

      console.warn(`Gemini model ${model} unavailable, trying fallback...`);
    }
  }

  throw lastError;
}

async function callGeminiModel(prompt, model) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const error = new Error(`Gemini API Error (${model}): ${errText || response.statusText}`);
    error.retryable = response.status === 429 || response.status === 500 || response.status === 503;
    throw error;
  }

  const json = await response.json();
  const candidate = json?.candidates?.[0];
  const contentText = candidate?.content?.parts?.map((p) => p.text).join('') || '';

  if (!contentText) {
    throw new Error('Gemini returned empty content.');
  }

  try {
    return JSON.parse(contentText);
  } catch (error) {
    const cleaned = contentText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

app.post('/api/gemini', async (req, res) => {
  try {
    const payload = sanitizePayload(req.body);
    const systemPrompt = buildGeminiPrompt(payload);
    const result = await callGemini(systemPrompt);

    res.json({
      summary: result.summary || 'ไม่สามารถสรุปข้อมูลได้จากข้อมูลที่เลือก',
      productionTrend: result.productionTrend || 'ไม่สามารถประเมินแนวโน้มการผลิตได้',
      consumptionTrend: result.consumptionTrend || 'ไม่สามารถประเมินแนวโน้มการใช้ได้',
      supplyGap: result.supplyGap || 'ไม่สามารถประเมิน Supply Gap ได้',
      highest: result.highest || 'ไม่พบค่าสูงสุด',
      lowest: result.lowest || 'ไม่พบค่าต่ำสุด',
      attention: Array.isArray(result.attention) && result.attention.length ? result.attention : ['ตรวจสอบข้อมูลในช่วงที่เลือกอย่างละเอียด'],
      rangeLabel: payload.rangeLabel || `${payload.filters.yearStart || '—'}–${payload.filters.yearEnd || '—'} · ${payload.filters.monthStart || '—'}–${payload.filters.monthEnd || '—'}`,
    });
  } catch (error) {
    console.error('Gemini API failed:', error.message);
    res.status(500).json({
      error: error.message || 'ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้',
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, model: GEMINI_MODEL });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
});
