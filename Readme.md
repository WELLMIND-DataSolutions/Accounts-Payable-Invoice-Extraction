# Intelligent RPA — Accounts Payable Invoice Extraction

A full-stack AI-powered platform that automates invoice processing end-to-end. Invoices are uploaded, preprocessed with OpenCV, extracted via a vision LLM (Groq / Llama-4), validated with arithmetic checks, confidence-scored, and automatically routed — either posted directly to ERP, flagged for soft review, or queued for manual correction via the HITL dashboard.

![Dashboard Screenshot](./frontend_picture.png)

---

## Key Features

- **PDF & Image Support** — Processes PDF (single and multi-page), PNG, JPG, TIFF, BMP, WEBP
- **AI Extraction** — Groq-hosted Llama-4-Scout vision model with Ollama fallback
- **Multi-page Stitching** — All pages stitched vertically before extraction; grand total always from last page
- **Discount-aware Arithmetic** — Validates `subtotal + tax − discount = total`
- **Confidence Scoring** — Per-field scores boosted or penalised by arithmetic and vendor registry results
- **Confidence Routing** — AUTO_POST (≥95%) / SOFT_REVIEW (80–95%) / MANUAL_REVIEW (<80% or errors)
- **Duplicate Detection** — Cross-session persistent store; duplicates are warnings, not hard blocks
- **HITL Dashboard** — Inline field editing with correction submission; corrections trigger vendor auto-registration
- **Vendor Registry** — Persistent JSON store; known vendors boost vendor_name confidence to 90%
- **Dark / Light Mode** — Full theme support
- **Fully Responsive** — Works on mobile, tablet, and desktop

---

## Project Structure

```
invoice-rpa/
├── README.md                        ← This file
├── frontend_picture.png             ← Dashboard screenshot
│
├── Backend/
│   ├── api.py                       ← FastAPI REST server
│   ├── main.py                      ← CLI pipeline runner
│   ├── setup_vendor_registry.py     ← One-time vendor setup script
│   ├── requirements.txt
│   ├── .env                         ← GROQ_API_KEY (never commit this)
│   ├── config/
│   │   └── settings.py
│   ├── core/
│   │   ├── pipeline.py              ← 6-step processing pipeline
│   │   ├── preprocessor.py          ← PyMuPDF + OpenCV image prep
│   │   ├── extractor.py             ← Groq / Ollama AI extraction
│   │   ├── validator.py             ← Arithmetic + confidence scoring
│   │   ├── router.py                ← Confidence-based routing
│   │   ├── models.py                ← Pydantic data models
│   │   └── feedback.py              ← HITL correction storage
│   ├── utils/
│   │   ├── output_writer.py         ← JSON result serialiser
│   │   └── printer.py               ← Rich terminal printer
│   ├── uploads/                     ← Auto-created; stores uploaded files
│   └── outputs/                     ← JSON result files + invoice_store.json
│
└── Frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── App.jsx                  ← Complete React dashboard (single file)
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.10+ | Backend |
| Node.js | 18+ | Frontend |
| npm | 9+ | Package manager |

---

## Backend Setup

### 1. Create and activate virtual environment

```bash
cd Backend

# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python -m venv .venv
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
pip install fastapi uvicorn python-multipart pymupdf
```

`requirements.txt` should include at minimum:
```
groq
opencv-python-headless
numpy
Pillow
reportlab
python-dotenv
rich
fastapi
uvicorn
python-multipart
pymupdf
```

### 3. Configure environment

Create `.env` in `Backend/`:
```env
GROQ_API_KEY=gsk_your_key_here
```

Get a free API key at [console.groq.com](https://console.groq.com).

> **Security:** Never commit `.env` to version control. Add it to `.gitignore`.

### 4. Register vendors (first time only)

```bash
python setup_vendor_registry.py
```

This populates `outputs/invoice_store.json` with known vendors. Vendor confidence jumps from 65% to 90% for matched invoices.

### 5. Start the API server

```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Verify: open [http://localhost:8000/api/health](http://localhost:8000/api/health)

```json
{ "status": "ok", "timestamp": "2025-..." }
```

Interactive API docs available at [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Frontend Setup

### 1. Create the Vite React project (first time only)

```bash
# From invoice-rpa/ (parent of Backend/)
npm create vite@latest Frontend -- --template react
cd Frontend
```

### 2. Install dependencies

```bash
npm install
npm install @remixicon/react
```

### 3. Copy App.jsx

Copy `App.jsx` into `Frontend/src/App.jsx` (replace the default).

### 4. Add Google Fonts

Open `Frontend/index.html` and add inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
```

### 5. Update main.jsx

`Frontend/src/main.jsx` should be:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Running Both Together

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd Backend
.venv\Scripts\activate          # Windows
uvicorn api:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd Frontend
npm run dev
```

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/invoice/process` | Upload and process an invoice file |
| `GET` | `/api/invoices` | List all results (supports `?route=`, `?status=`, `?limit=`, `?offset=`) |
| `GET` | `/api/invoice/{id}` | Get single invoice result |
| `DELETE` | `/api/invoice/{id}` | Delete a result |
| `POST` | `/api/invoice/{id}/correct` | Submit HITL field corrections |
| `GET` | `/api/stats` | Dashboard statistics (totals, averages, route distribution) |
| `GET` | `/api/vendors` | List registered vendors |
| `POST` | `/api/vendor/register` | Register a new vendor |
| `GET` | `/api/health` | Health check |

Full interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Pipeline Overview

```
Upload
  │
  ▼ Step 1 — Ingest
  Validate file type and size
  │
  ▼ Step 2 — Preprocess (preprocessor.py)
  PyMuPDF: PDF → images (all pages, 300 DPI)
  Multi-page stitch → one tall image
  OpenCV: deskew · denoise · sharpen · contrast
  Base64 encode (capped at 3.5 MB for Groq API)
  │
  ▼ Step 3 — AI Extraction (extractor.py)
  Groq Llama-4-Scout vision model
  Structured JSON prompt → field extraction
  Hallucination filters on line items
  Auto-compute fallback: total = subtotal + tax − discount
  │
  ▼ Step 4 — Validation (validator.py)
  Required field checks
  Date format validation
  Arithmetic: subtotal + tax − discount = total
  Vendor registry match / penalty
  Duplicate detection (persistent store)
  Per-field confidence scoring
  │
  ▼ Step 5 — Routing (router.py)
  Overall confidence ≥ 95%  →  AUTO_POST
  80% – 94%                 →  SOFT_REVIEW
  < 80% or errors           →  MANUAL_REVIEW
  │
  ▼ Step 6 — Output
  JSON result saved to outputs/
  API response returned to dashboard
```

---

## Confidence Scoring Logic

| Field | Base Score | Boosted To | Condition |
|-------|-----------|-----------|-----------|
| `vendor_name` | 0.65 | 0.90 | Found in vendor registry |
| `vendor_name` | 0.65 | 0.45 | Not in registry (penalty) |
| `total_amount` | 0.72 | 0.88 | Arithmetic confirmed |
| `subtotal` | 0.72 | 0.88 | Line items sum matches |
| `tax_amount` | 0.72 | 0.85 | Total reconciliation passed |
| `invoice_date` | 0.80 | — | Format: YYYY-MM-DD |
| `currency` | 0.82 | — | Matches ISO 3-letter code |

**Arithmetic gate:** If `arithmetic_ok = False`, overall confidence is hard-capped at 0.79, preventing AUTO_POST or SOFT_REVIEW for invoices with incorrect totals.

---

## Test Invoice Phases

Six test PDFs are included to validate every pipeline scenario:

| Phase | File | Description | Expected Route |
|-------|------|-------------|---------------|
| 1 | `phase1_clean_digital.pdf` | Clean digital PDF with discount | SOFT_REVIEW / AUTO_POST |
| 2 | `phase2_scanned_good.pdf` | Lightly scanned, minimal noise | SOFT_REVIEW |
| 3 | `phase3_scanned_blurry.pdf` | Medium blur, rotation stress test | MANUAL_REVIEW |
| 4 | `phase4_multipage.pdf` | 2-page invoice, grand total on page 2 | SOFT_REVIEW |
| 5 | `phase5_foreign_language.pdf` | Arabic + English bilingual, SAR currency | SOFT_REVIEW |
| 6 | `phase6_handwritten.pdf` | Printed template + handwritten values | MANUAL_REVIEW |

Run a fresh test:
```bash
# 1. Clear processed invoice store
# Edit outputs/invoice_store.json → set "invoices": {}

# 2. Re-register vendors
python setup_vendor_registry.py

# 3. Run pipeline on each phase
python main.py
```

---

## Dashboard Features

### Dashboard Page
- 4 KPI cards: Total Processed, Auto Posted, Pending Review, Avg Confidence
- Invoice upload (drag-and-drop or file picker)
- Routing distribution horizontal bar chart
- Recent activity table

### Invoices Page
- Full searchable and filterable invoice table
- Filter by route (Auto Post / Soft Review / Manual Review / Corrected)
- Confidence bars per row
- Inline upload zone

### Detail Panel (opens on row click)
- **Fields tab** — all extracted fields in a grid; click Edit to correct inline
- **Items tab** — line items table with per-row arithmetic check
- **Confidence tab** — overall + completeness scores; per-field confidence bars
- **Checks tab** — validation errors and warnings; duplicate flag

### Vendors Page
- Add new vendor to registry
- View all registered vendors with active status

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for Llama-4 vision model |

---

## Technology Stack

### Backend
| Layer | Technology |
|-------|-----------|
| API Framework | FastAPI |
| PDF Conversion | PyMuPDF (fitz) |
| Image Processing | OpenCV, Pillow |
| AI Extraction | Groq API (Llama-4-Scout-17B) |
| Fallback AI | Ollama (local) |
| Data Validation | Pydantic |
| Terminal UI | Rich |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build Tool | Vite |
| Icons | Remix Icon (@remixicon/react) |
| Fonts | Inter + JetBrains Mono (Google Fonts) |
| HTTP | Fetch API |
| Styling | CSS-in-JS (style tags + CSS variables) |

---

## Common Issues

**`@remixicon/react` not found**
```bash
cd Frontend && npm install @remixicon/react
```

**CORS error in browser**
Make sure `api.py` is running on port 8000. The `API` constant in `App.jsx` defaults to `http://localhost:8000/api`.

**PyMuPDF not found**
```bash
pip install pymupdf --break-system-packages
```

**Groq 429 rate limit**
The extractor uses exponential backoff: 60s, 120s, 180s. If you hit limits on the free tier, wait a minute and retry.

**Invoice store not persisting**
Check that `outputs/` directory exists and is writable. The store is saved to `outputs/invoice_store.json`.

---

## License

MIT — free to use, modify, and distribute.