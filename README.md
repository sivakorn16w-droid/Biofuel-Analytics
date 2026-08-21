# Biofuel Analytics — Gemini Flash setup

สรุปสั้น ๆ เพื่อให้คุณตั้งค่า Gemini (ทำที่บ้าน) และรันเซิร์ฟเวอร์

การเตรียมเครื่อง
- ติดตั้ง Node.js (v16+) และ `npm`

ตั้งค่าตัวแปรสภาพแวดล้อม
1. สร้างไฟล์ `.env` จาก `.env.example` และใส่ค่า `GEMINI_API_KEY` ของคุณ

ตัวอย่าง `.env`:
```
GEMINI_API_KEY=sk-...
GEMINI_MODEL=gemini-2.0-flash
PORT=3000
```

รันเซิร์ฟเวอร์ (PowerShell):
```powershell
npm install
$env:GEMINI_API_KEY="YOUR_API_KEY_HERE"
node server.js
```

หรือใช้ `.env` ที่สร้างไว้และรันปกติ:
```powershell
npm install
node server.js
```

ตรวจสอบ
- เปิดเบราเซอร์ที่ `http://localhost:3000` และลองกดปุ่ม `Gemini Flash` เพื่อเรียกการวิเคราะห์

ข้อควรระวัง
- ห้ามเก็บ `GEMINI_API_KEY` ไว้ใน repo สาธารณะ
- หากเว็บเซิร์ฟเวอร์อยู่ภายนอกสำนักงาน ให้แน่ใจว่า API key เก็บในที่ปลอดภัย

ถ้าต้องการ ผมสามารถช่วยสร้างโหมดทดสอบ (mock) เพื่อทดสอบ UI โดยไม่ต้องใช้คีย์จริง — ต้องการไหม?
